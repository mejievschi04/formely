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
    private const ALLOWED_EXTENSIONS = ['pdf', 'epub', 'mobi', 'doc', 'docx', 'txt', 'zip'];

    private function serializeItem(LibraryItem $item): array
    {
        $mimeType = strtolower((string) ($item->mime_type ?? ''));
        $filename = strtolower((string) ($item->original_filename ?? ''));

        return [
            'id' => $item->id,
            'title' => $item->title,
            'description' => $item->description,
            'original_filename' => $item->original_filename,
            'mime_type' => $item->mime_type,
            'size_bytes' => $item->size_bytes,
            'created_at' => $item->created_at,
            'is_pdf' => $mimeType === 'application/pdf' || str_ends_with($filename, '.pdf'),
            'cover_image_url' => $item->cover_image_url,
            'uploader' => $item->uploader ? [
                'id' => $item->uploader->id,
                'name' => $item->uploader->name,
            ] : null,
        ];
    }

    public function index(Request $request)
    {
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
        $user = $request->user();
        if ($user->isAnalyst() || ! ($user->isAdmin() || $user->isInstructor())) {
            abort(403, 'Doar administratorii și instructorii pot încărca în bibliotecă.');
        }

        $maxUploadKb = max(1024, (int) config('formely.library_upload_max_kb', 524288));

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:5000',
            // Laravel's `max` validator uses KB.
            'file' => 'required|file|max:' . $maxUploadKb,
            /** Copertă opțională (ex. prima pagină generată în browser ca JPEG). */
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
            'original_filename' => $original,
            'stored_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'size_bytes' => (int) $file->getSize(),
        ]);

        $coversDir = 'library/covers';
        Storage::disk($disk)->makeDirectory($coversDir);

        $coverUploaded = $request->hasFile('cover') && $request->file('cover')->isValid();
        if ($coverUploaded) {
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
            'item' => $this->serializeItem($item),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $user = $request->user();
        if ($user->isAnalyst() || ! ($user->isAdmin() || $user->isInstructor())) {
            abort(403, 'Nu poți șterge din bibliotecă.');
        }

        $item = LibraryItem::findOrFail($id);

        if ($user->isInstructor() && ! $user->isAdmin() && (int) $item->user_id !== (int) $user->id) {
            abort(403, 'Poți șterge doar fișierele încărcate de tine.');
        }

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
