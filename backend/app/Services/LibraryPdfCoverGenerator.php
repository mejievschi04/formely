<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

/**
 * Generează JPEG din prima pagină a unui PDF.
 *
 * Ordine: Ghostscript (gs / gswin64c) → Imagick → pdftoppm.
 * Pe Windows instalează Ghostscript și opțional setează LIBRARY_PDF_GS către gswin64c.exe.
 */
class LibraryPdfCoverGenerator
{
    public function generateFirstPageToJpg(string $absolutePdfPath, string $absoluteJpegOutputPath): bool
    {
        if (! is_readable($absolutePdfPath)) {
            Log::warning('Library PDF cover: PDF nu poate fi citit', ['path' => $absolutePdfPath]);

            return false;
        }

        $dir = dirname($absoluteJpegOutputPath);
        if (! is_dir($dir) && ! @mkdir($dir, 0755, true)) {
            Log::warning('Library PDF cover: nu s-a putut crea directorul', ['dir' => $dir]);

            return false;
        }

        @unlink($absoluteJpegOutputPath);

        if ($this->tryGhostscript($absolutePdfPath, $absoluteJpegOutputPath)) {
            return $this->outputOk($absoluteJpegOutputPath);
        }

        if ($this->tryImagick($absolutePdfPath, $absoluteJpegOutputPath)) {
            return $this->outputOk($absoluteJpegOutputPath);
        }

        if ($this->tryPdftoppm($absolutePdfPath, $absoluteJpegOutputPath)) {
            return $this->outputOk($absoluteJpegOutputPath);
        }

        Log::warning('Library PDF cover: toate metodele au eșuat (instalează Ghostscript sau Imagick+Ghostscript sau poppler/pdftoppm)', [
            'pdf' => $absolutePdfPath,
        ]);

        return false;
    }

    private function outputOk(string $path): bool
    {
        return is_file($path) && filesize($path) > 0;
    }

    private function tryGhostscript(string $absolutePdfPath, string $absoluteJpegOutputPath): bool
    {
        $binary = $this->resolveGhostscriptBinary();
        if ($binary === null) {
            return false;
        }

        $process = new Process([
            $binary,
            '-dQUIET',
            '-dSAFER',
            '-dBATCH',
            '-dNOPAUSE',
            '-sDEVICE=jpeg',
            '-r144',
            '-dFirstPage=1',
            '-dLastPage=1',
            '-dJPEGQ=88',
            '-sOutputFile='.$absoluteJpegOutputPath,
            $absolutePdfPath,
        ]);
        $process->setTimeout(120);

        try {
            $process->run();
            if ($process->isSuccessful() && $this->outputOk($absoluteJpegOutputPath)) {
                return true;
            }
            if (! $process->isSuccessful()) {
                Log::info('Library PDF cover: Ghostscript eșuat', [
                    'stderr' => $process->getErrorOutput(),
                    'exit' => $process->getExitCode(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::info('Library PDF cover: Ghostscript excepție', ['message' => $e->getMessage()]);
        }

        @unlink($absoluteJpegOutputPath);

        return false;
    }

    private function resolveGhostscriptBinary(): ?string
    {
        $configured = config('volta.library_pdf_gs');
        if (is_string($configured) && $configured !== '') {
            $trim = trim($configured, " \t\n\r\0\x0B\"'");
            if ($trim !== '' && (is_file($trim) || $this->commandExists($trim))) {
                return $trim;
            }
        }

        $candidates = PHP_OS_FAMILY === 'Windows'
            ? ['gswin64c', 'gswin32c', 'gs']
            : ['gs', 'gswin64c'];

        foreach ($candidates as $name) {
            if ($this->commandExists($name)) {
                return $name;
            }
        }

        return null;
    }

    private function commandExists(string $name): bool
    {
        $p = new Process([$name, '--version']);
        $p->setTimeout(8);

        try {
            $p->run();

            return $p->isSuccessful();
        } catch (\Throwable) {
            return false;
        }
    }

    private function tryImagick(string $absolutePdfPath, string $absoluteJpegOutputPath): bool
    {
        if (! extension_loaded('imagick')) {
            return false;
        }

        try {
            $imagick = new \Imagick();
            $imagick->setResolution(144, 144);
            $imagick->readImage($absolutePdfPath . '[0]');
            $imagick->setImageFormat('jpeg');
            $imagick->setImageBackgroundColor(new \ImagickPixel('#ffffff'));

            if (defined('Imagick::ALPHACHANNEL_REMOVE')) {
                try {
                    $imagick->setImageAlphaChannel(\Imagick::ALPHACHANNEL_REMOVE);
                } catch (\Throwable) {
                    /* unele PDF fără canal alfa */
                }
            }

            // mergeImageLayers returnează un NOU obiect — trebuie salvat acela, altfel JPEG poate fi gol.
            $flat = $imagick->mergeImageLayers(\Imagick::LAYERMETHOD_FLATTEN);
            $flat->setImageFormat('jpeg');
            $flat->setImageCompression(\Imagick::COMPRESSION_JPEG);
            $flat->setImageCompressionQuality(88);
            if (method_exists($flat, 'stripImage')) {
                $flat->stripImage();
            }
            $flat->writeImage($absoluteJpegOutputPath);
            $flat->clear();
            $flat->destroy();
            $imagick->clear();
            $imagick->destroy();

            if ($this->outputOk($absoluteJpegOutputPath)) {
                return true;
            }
        } catch (\Throwable $e) {
            Log::info('Library PDF cover: Imagick eșuat', [
                'message' => $e->getMessage(),
            ]);
        }

        @unlink($absoluteJpegOutputPath);

        // Fallback Imagick fără merge (unele instalări)
        try {
            $im = new \Imagick();
            $im->setResolution(144, 144);
            $im->readImage($absolutePdfPath . '[0]');
            $im->setImageFormat('jpeg');
            $im->setImageCompressionQuality(88);
            $im->writeImage($absoluteJpegOutputPath);
            $im->clear();
            $im->destroy();

            return $this->outputOk($absoluteJpegOutputPath);
        } catch (\Throwable $e2) {
            Log::info('Library PDF cover: Imagick simplu eșuat', ['message' => $e2->getMessage()]);
        }

        @unlink($absoluteJpegOutputPath);

        return false;
    }

    private function tryPdftoppm(string $absolutePdfPath, string $absoluteJpegOutputPath): bool
    {
        $prefix = dirname($absoluteJpegOutputPath) . '/tmp_' . bin2hex(random_bytes(6));
        $process = new Process([
            'pdftoppm',
            '-jpeg',
            '-r',
            '144',
            '-f',
            '1',
            '-l',
            '1',
            '-singlefile',
            $absolutePdfPath,
            $prefix,
        ]);
        $process->setTimeout(120);

        try {
            $process->run();
            if (! $process->isSuccessful()) {
                Log::info('Library PDF cover: pdftoppm', [
                    'stderr' => $process->getErrorOutput(),
                    'exit' => $process->getExitCode(),
                ]);

                return false;
            }

            $candidate = $prefix . '.jpg';
            if (! is_file($candidate) || filesize($candidate) <= 0) {
                return false;
            }

            if (! @rename($candidate, $absoluteJpegOutputPath)) {
                if (! @copy($candidate, $absoluteJpegOutputPath)) {
                    return false;
                }
                @unlink($candidate);
            }

            return $this->outputOk($absoluteJpegOutputPath);
        } catch (\Throwable $e) {
            Log::info('Library PDF cover: pdftoppm excepție', ['message' => $e->getMessage()]);
        }

        return false;
    }
}
