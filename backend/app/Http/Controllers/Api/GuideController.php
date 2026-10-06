<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GuideItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class GuideController extends Controller
{
    private function serializeItem(GuideItem $item): array
    {
        return [
            'id' => $item->id,
            'title' => $item->title,
            'description' => $item->description,
            'url' => $item->url,
            'cover_image_url' => $item->cover_image_url,
            'created_at' => $item->created_at,
            'uploader' => $item->uploader ? [
                'id' => $item->uploader->id,
                'name' => $item->uploader->name,
            ] : null,
        ];
    }

    private function assertCanMutate(Request $request): void
    {
        $user = $request->user();
        if ($user->isAnalyst() || ! ($user->isAdmin() || $user->isInstructor())) {
            abort(403, 'Doar administratorii și instructorii pot modifica ghidurile.');
        }
    }

    private function assertCanDeleteItem(Request $request, GuideItem $item): void
    {
        $this->assertCanMutate($request);
        $user = $request->user();
        if ($user->isInstructor() && ! $user->isAdmin() && (int) $item->user_id !== (int) $user->id) {
            abort(403, 'Poți modifica doar ghidurile create de tine.');
        }
    }

    private function normalizeUrl(string $url): string
    {
        $trimmed = trim($url);
        if ($trimmed === '') {
            return '';
        }
        if (! preg_match('#^https?://#i', $trimmed)) {
            $trimmed = 'https://' . $trimmed;
        }

        return $trimmed;
    }

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->get('per_page', 24), 1), 100);

        $paginator = GuideItem::query()
            ->with('uploader:id,name')
            ->orderByDesc('id')
            ->paginate($perPage);

        $data = $paginator->getCollection()->map(fn (GuideItem $item) => $this->serializeItem($item));

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

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'url' => 'required|string|max:2048',
            'cover' => 'nullable|file|mimes:jpeg,jpg,png,webp|max:10240',
        ]);

        $url = $this->normalizeUrl($validated['url']);
        if ($url === '' || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['message' => 'Adresa URL nu este validă.'], 422);
        }

        $user = $request->user();
        $item = GuideItem::create([
            'user_id' => $user->id,
            'title' => trim($validated['title']),
            'description' => $validated['description'] ?? null,
            'url' => $url,
        ]);

        $this->persistCoverUpload($request, $item);
        $item->refresh();
        $item->load('uploader:id,name');

        return response()->json([
            'message' => 'Ghidul a fost adăugat.',
            'item' => $this->serializeItem($item),
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $item = GuideItem::findOrFail($id);
        $this->assertCanDeleteItem($request, $item);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'url' => 'required|string|max:2048',
            'cover' => 'nullable|file|mimes:jpeg,jpg,png,webp|max:10240',
            'remove_cover' => 'nullable|boolean',
        ]);

        $url = $this->normalizeUrl($validated['url']);
        if ($url === '' || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['message' => 'Adresa URL nu este validă.'], 422);
        }

        $item->update([
            'title' => trim($validated['title']),
            'description' => $validated['description'] ?? null,
            'url' => $url,
        ]);

        if ($request->boolean('remove_cover')) {
            $this->deleteCoverImage($item);
        } else {
            $this->persistCoverUpload($request, $item);
        }

        $item->refresh();
        $item->load('uploader:id,name');

        return response()->json([
            'message' => 'Ghidul a fost actualizat.',
            'item' => $this->serializeItem($item),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $item = GuideItem::findOrFail($id);
        $this->assertCanDeleteItem($request, $item);

        $this->deleteCoverImage($item, 'public', false);
        $item->delete();

        return response()->json(['message' => 'Ghidul a fost eliminat.']);
    }

    private function persistCoverUpload(Request $request, GuideItem $item, string $disk = 'public'): void
    {
        if (! $request->hasFile('cover') || ! $request->file('cover')->isValid()) {
            return;
        }

        $this->deleteCoverImage($item, $disk, false);

        $coversDir = 'guides/covers';
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
            $item->id . '_' . Str::random(8) . '.' . $coverExt,
            $disk
        );

        if ($coverRel) {
            $item->forceFill(['cover_image_path' => $coverRel])->save();
        }
    }

    private function deleteCoverImage(GuideItem $item, string $disk = 'public', bool $save = true): void
    {
        if ($item->cover_image_path) {
            Storage::disk($disk)->delete($item->cover_image_path);
            if ($save) {
                $item->forceFill(['cover_image_path' => null])->save();
            }
        }
    }
}
