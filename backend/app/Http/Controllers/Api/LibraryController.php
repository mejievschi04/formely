<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LibraryItem;
use App\Services\LibraryPdfCoverGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LibraryController extends Controller
{
    use \App\Http\Controllers\Concerns\AssertsPlanEntitlements;

    private const ALLOWED_EXTENSIONS = ['pdf', 'epub', 'mobi', 'doc', 'docx', 'txt', 'zip'];

    private function isTextItem(LibraryItem $item): bool
    {
        return ($item->content_type ?? 'file') === 'text';
    }

    private function serializeItem(LibraryItem $item, bool $includeBody = false): array
    {
        $mimeType = strtolower((string) ($item->mime_type ?? ''));
        $filename = strtolower((string) ($item->original_filename ?? ''));
        $isText = $this->isTextItem($item);

        $payload = [
            'id' => $item->id,
            'title' => $item->title,
            'description' => $item->description,
            'content_type' => $item->content_type ?? 'file',
            'is_text' => $isText,
            'original_filename' => $item->original_filename,
            'mime_type' => $item->mime_type,
            'size_bytes' => $item->size_bytes,
            'created_at' => $item->created_at,
            'is_pdf' => ! $isText && ($mimeType === 'application/pdf' || str_ends_with($filename, '.pdf')),
            'cover_image_url' => $item->cover_image_url,
            'uploader' => $item->uploader ? [
                'id' => $item->uploader->id,
                'name' => $item->uploader->name,
            ] : null,
        ];

        if ($includeBody && $isText) {
            $payload['body'] = $item->body;
        }

        return $payload;
    }

    private function assertCanMutate(Request $request): void
    {
        $user = $request->user();
        if ($user->isAnalyst() || ! ($user->isAdmin() || $user->isInstructor())) {
            abort(403, 'Doar administratorii și instructorii pot modifica biblioteca.');
        }
    }

    private function assertCanDeleteItem(Request $request, LibraryItem $item): void
    {
        $this->assertCanMutate($request);
        $user = $request->user();
        if ($user->isInstructor() && ! $user->isAdmin() && (int) $item->user_id !== (int) $user->id) {
            abort(403, 'Poți modifica doar materialele create de tine.');
        }
    }

    public function index(Request $request)
    {
        $this->assertCompanyFeature('library');
        $perPage = min(max((int) $request->get('per_page', 24), 1), 100);

        $paginator = LibraryItem::query()
            ->with('uploader:id,name')
            ->orderByDesc('id')
            ->paginate($perPage);

        $data = $paginator->getCollection()->map(fn (LibraryItem $item) => $this->serializeItem($item));

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->assertCanMutate($request);

        if ($request->input('content_type') === 'text' || $request->filled('body')) {
            return $this->storeTextItem($request);
        }

        return $this->storeFileItem($request);
    }

    private function storeTextItem(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'body' => 'required|string|min:1|max:500000',
            'cover' => 'nullable|file|mimes:jpeg,jpg,png,webp|max:10240',
        ]);

        $item = LibraryItem::create([
            'user_id' => $user->id,
            'title' => trim($validated['title']),
            'description' => $validated['description'] ?? null,
            'content_type' => 'text',
            'body' => $validated['body'],
            'original_filename' => null,
            'stored_path' => null,
            'mime_type' => 'text/html',
            'size_bytes' => strlen($validated['body']),
        ]);

        $this->persistCoverUpload($request, $item);
        $item->refresh();
        $item->load('uploader:id,name');

        return response()->json([
            'message' => 'Materialul a fost publicat în bibliotecă.',
            'item' => $this->serializeItem($item, true),
        ], 201);
    }

    private function storeFileItem(Request $request)
    {
        $user = $request->user();
        $maxUploadKb = max(1024, (int) config('formely.library_upload_max_kb', 524288));

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:5000',
            'file' => 'required|file|max:' . $maxUploadKb,
            'cover' => 'nullable|file|mimes:jpeg,jpg,png,webp|max:10240',
        ]);

        $file = $request->file('file');
        $ext = strtolower($file->getClientOriginalExtension() ?: '');
        if ($ext === '' || ! in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            return response()->json([
                'message' => 'Tip fișier neacceptat. Permise: ' . implode(', ', self::ALLOWED_EXTENSIONS),
            ], 422);
        }

        $original = $file->getClientOriginalName() ?: ('document.' . $ext);
        $title = trim((string) ($validated['title'] ?? ''));
        if ($title === '') {
            $title = pathinfo($original, PATHINFO_FILENAME) ?: 'Document';
        }

        $disk = 'public';
        $basename = (string) Str::uuid() . '.' . $ext;
        $path = $file->storeAs('library', $basename, $disk);

        if ($path === false || $path === '') {
            return response()->json(['message' => 'Nu s-a putut salva fișierul.'], 500);
        }

        $item = LibraryItem::create([
            'user_id' => $user->id,
            'title' => $title,
            'description' => $validated['description'] ?? null,
            'content_type' => 'file',
            'original_filename' => $original,
            'stored_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'size_bytes' => (int) $file->getSize(),
        ]);

        $coversDir = 'library/covers';
        Storage::disk($disk)->makeDirectory($coversDir);

        $coverUploaded = $request->hasFile('cover') && $request->file('cover')->isValid();
        if ($coverUploaded) {
            $this->persistCoverUpload($request, $item, $disk);
        } elseif ($ext === 'pdf') {
            $this->tryAttachPdfCover($item, $disk);
            $item->refresh();
        }

        $item->load('uploader:id,name');

        return response()->json([
            'message' => 'Fișier încărcat în bibliotecă.',
            'item' => $this->serializeItem($item),
        ], 201);
    }

    public function show(Request $request, int $id)
    {
        $item = LibraryItem::with('uploader:id,name')->findOrFail($id);

        return response()->json([
            'item' => $this->serializeItem($item, true),
        ]);
    }

    public function update(Request $request, int $id)
    {
        $item = LibraryItem::findOrFail($id);
        $this->assertCanDeleteItem($request, $item);

        if (! $this->isTextItem($item)) {
            abort(422, 'Doar materialele scrise pot fi editate din bibliotecă.');
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'body' => 'required|string|min:1|max:500000',
            'cover' => 'nullable|file|mimes:jpeg,jpg,png,webp|max:10240',
            'remove_cover' => 'nullable|boolean',
        ]);

        $item->update([
            'title' => trim($validated['title']),
            'description' => $validated['description'] ?? null,
            'body' => $validated['body'],
            'size_bytes' => strlen($validated['body']),
        ]);

        if ($request->boolean('remove_cover')) {
            $this->deleteCoverImage($item);
        } else {
            $this->persistCoverUpload($request, $item);
        }

        $item->refresh();
        $item->load('uploader:id,name');

        return response()->json([
            'message' => 'Materialul a fost actualizat.',
            'item' => $this->serializeItem($item, true),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $item = LibraryItem::findOrFail($id);
        $this->assertCanDeleteItem($request, $item);

        $disk = 'public';
        if ($item->cover_image_path) {
            Storage::disk($disk)->delete($item->cover_image_path);
        }
        if ($item->stored_path) {
            Storage::disk($disk)->delete($item->stored_path);
        }
        $item->delete();

        return response()->json(['message' => 'Element eliminat din bibliotecă.']);
    }

    public function download(Request $request, int $id): StreamedResponse
    {
        $item = LibraryItem::findOrFail($id);

        if ($this->isTextItem($item)) {
            $filename = Str::slug($item->title ?: 'material') . '.html';
            $html = $this->wrapTextItemHtml($item);

            return response()->streamDownload(function () use ($html) {
                echo $html;
            }, $filename, [
                'Content-Type' => 'text/html; charset=UTF-8',
            ]);
        }

        $disk = 'public';
        $path = $item->stored_path;

        if ($path === '' || $path === null || ! Storage::disk($disk)->exists($path)) {
            abort(404, 'Fișierul nu mai este disponibil.');
        }

        $filename = $item->original_filename ?: basename($path);

        return Storage::disk($disk)->download($path, $filename, [
            'Content-Type' => $item->mime_type ?: 'application/octet-stream',
        ]);
    }

    private function wrapTextItemHtml(LibraryItem $item): string
    {
        $title = e($item->title ?: 'Material bibliotecă');
        $body = $item->body ?? '';

        return '<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<title>' . $title . '</title>'
            . '<style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:760px;margin:2rem auto;padding:0 1rem;color:#0f172a;}img{max-width:100%;height:auto;}</style>'
            . '</head><body>' . $body . '</body></html>';
    }

    private function persistCoverUpload(Request $request, LibraryItem $item, string $disk = 'public'): void
    {
        if (! $request->hasFile('cover') || ! $request->file('cover')->isValid()) {
            return;
        }

        $this->deleteCoverImage($item, $disk, false);

        $coversDir = 'library/covers';
        Storage::disk($disk)->makeDirectory($coversDir);

        $coverFile = $request->file('cover');
        $coverExt = strtolower($coverFile->getClientOriginalExtension() ?: 'jpg');
        if (! in_array($coverExt, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            $coverExt = 'jpg';
        }
        if ($coverExt === 'jpeg') {
            $coverExt = 'jpg';
        }

        $coverRel = $coverFile->storeAs(
            $coversDir,
            $item->id . '_client_' . Str::random(8) . '.' . $coverExt,
            $disk
        );

        if ($coverRel) {
            $item->forceFill(['cover_image_path' => $coverRel])->save();
        }
    }

    private function deleteCoverImage(LibraryItem $item, string $disk = 'public', bool $save = true): void
    {
        if ($item->cover_image_path) {
            Storage::disk($disk)->delete($item->cover_image_path);
            if ($save) {
                $item->forceFill(['cover_image_path' => null])->save();
            }
        }
    }

    private function tryAttachPdfCover(LibraryItem $item, string $disk): void
    {
        $coversDir = 'library/covers';
        Storage::disk($disk)->makeDirectory($coversDir);

        $coverRelative = $coversDir . '/' . $item->id . '_srv_' . Str::random(10) . '.jpg';
        $absOut = Storage::disk($disk)->path($coverRelative);
        $absPdf = Storage::disk($disk)->path($item->stored_path);

        if (! is_readable($absPdf)) {
            return;
        }

        $generator = app(LibraryPdfCoverGenerator::class);
        if ($generator->generateFirstPageToJpg($absPdf, $absOut)) {
            $item->forceFill(['cover_image_path' => $coverRelative])->save();
        } elseif (is_file($absOut)) {
            @unlink($absOut);
        }
    }
}
