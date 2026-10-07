<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Throwable;

/**
 * Comprimă imaginile încărcate ca paginile să se încarce repede: le micșorează până la latura maximă
 * cerută și le salvează WebP (păstrează transparența PNG). Dacă rezultatul nu e mai mic sau imaginea
 * nu poate fi citită, se păstrează fișierul original. GIF și SVG rămân neatinse (animație / vector).
 */
class ImageOptimizer
{
    /** Imaginile din lecții și bibliotecă. */
    public const CONTENT_MAX = 2000;

    /** Copertele de curs, hartă, ghid și material. */
    public const COVER_MAX = 1600;

    public const AVATAR_MAX = 512;

    private const QUALITY = 82;

    /** Peste atâția pixeli GD ar avea nevoie de prea multă memorie; fișierul rămâne cum e. */
    private const MAX_PIXELS = 50_000_000;

    public static function optimize(UploadedFile $file, int $maxDimension = self::CONTENT_MAX): UploadedFile
    {
        try {
            return self::compress($file, $maxDimension) ?? $file;
        } catch (Throwable $e) {
            report($e);

            return $file;
        }
    }

    private static function compress(UploadedFile $file, int $maxDimension): ?UploadedFile
    {
        if (! function_exists('imagewebp') || ! $file->isValid()) {
            return null;
        }

        $mime = strtolower((string) $file->getMimeType());
        if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return null;
        }

        $path = $file->getRealPath();
        $info = @getimagesize($path);
        if (! $info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > self::MAX_PIXELS) {
            return null;
        }

        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png' => @imagecreatefrompng($path),
            'image/webp' => @imagecreatefromwebp($path),
        };
        if (! $image) {
            return null;
        }

        try {
            if ($mime === 'image/jpeg') {
                $image = self::applyExifOrientation($image, $path);
            }

            $width = imagesx($image);
            $height = imagesy($image);
            $scale = min(1, $maxDimension / max($width, $height));
            $resized = $scale < 1;

            if ($resized) {
                $newWidth = max(1, (int) round($width * $scale));
                $newHeight = max(1, (int) round($height * $scale));
                $target = imagecreatetruecolor($newWidth, $newHeight);
                imagealphablending($target, false);
                imagesavealpha($target, true);
                imagefill($target, 0, 0, imagecolorallocatealpha($target, 0, 0, 0, 127));
                imagecopyresampled($target, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                imagedestroy($image);
                $image = $target;
            } else {
                if (! imageistruecolor($image)) {
                    imagepalettetotruecolor($image);
                }
                imagealphablending($image, false);
                imagesavealpha($image, true);
            }

            $output = tempnam(sys_get_temp_dir(), 'img');
            if ($output === false || ! imagewebp($image, $output, self::QUALITY)) {
                return null;
            }
        } finally {
            imagedestroy($image);
        }

        clearstatcache(true, $output);
        $newSize = (int) filesize($output);
        // Fără micșorare, conversia merită doar dacă fișierul chiar devine mai mic.
        if ($newSize <= 0 || (! $resized && $newSize >= (int) $file->getSize())) {
            @unlink($output);

            return null;
        }

        // fișierul temporar e copiat în storage la salvare; îl ștergem la finalul cererii
        register_shutdown_function(static fn () => @unlink($output));
        $name = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME) ?: 'imagine';

        return new UploadedFile($output, $name . '.webp', 'image/webp', null, true);
    }

    /** Pozele de pe telefon sunt adesea salvate rotite, cu orientarea în EXIF; o aplicăm înainte de WebP. */
    private static function applyExifOrientation(\GdImage $image, string $path): \GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }
        $exif = @exif_read_data($path);
        $orientation = (int) ($exif['Orientation'] ?? 1);
        $angle = match ($orientation) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $image;
        }
        $rotated = imagerotate($image, $angle, 0);
        if (! $rotated) {
            return $image;
        }
        imagedestroy($image);

        return $rotated;
    }
}
