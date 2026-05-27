<?php

namespace App\Console\Commands;

use App\Models\LibraryItem;
use App\Services\LibraryPdfCoverGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Generează coperte JPEG din prima pagină pentru PDF-uri existente fără copertă.
 * Necesită Imagick (+ Ghostscript) sau `pdftoppm` în PATH.
 */
class RegenerateLibraryPdfCoversCommand extends Command
{
    protected $signature = 'library:regenerate-covers {--limit=50 : Max items to process}';

    protected $description = 'Regenerează imagini de copertă (prima pagină) pentru articole PDF din bibliotecă';

    public function handle(LibraryPdfCoverGenerator $generator): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $disk = 'public';

        $items = LibraryItem::query()
            ->whereNull('cover_image_path')
            ->where(function ($q) {
                $q->where('mime_type', 'application/pdf')
                    ->orWhere('original_filename', 'like', '%.pdf');
            })
            ->orderBy('id')
            ->limit($limit)
            ->get();

        if ($items->isEmpty()) {
            $this->info('Nu există PDF-uri fără copertă de procesat.');

            return self::SUCCESS;
        }

        Storage::disk($disk)->makeDirectory('library/covers');
        $ok = 0;
        foreach ($items as $item) {
            $path = $item->stored_path;
            if (! $path || ! Storage::disk($disk)->exists($path)) {
                $this->warn("Sari peste #{$item->id}: fișier lipsă.");
                continue;
            }
            $absPdf = Storage::disk($disk)->path($path);
            $coverRelative = 'library/covers/' . $item->id . '_' . Str::random(10) . '.jpg';
            $absOut = Storage::disk($disk)->path($coverRelative);

            if ($generator->generateFirstPageToJpg($absPdf, $absOut)) {
                $item->forceFill(['cover_image_path' => $coverRelative])->save();
                $this->line("Copertă generată pentru #{$item->id} — {$item->title}");
                $ok++;
            } else {
                if (is_file($absOut)) {
                    @unlink($absOut);
                }
                $this->warn("Eșuat coperta pentru #{$item->id} (Imagick/pdftoppm indisponibil sau PDF invalid).");
            }
        }

        $this->info("Gata: {$ok}/{$items->count()} coperte generate.");

        return self::SUCCESS;
    }
}
