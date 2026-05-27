<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MediaAdminController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'nullable|integer|min:1',
            'type' => 'nullable|string|max:50',
            'q' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $perPage = (int)($validated['per_page'] ?? 24);

        $query = MediaAsset::query()->orderByDesc('id');
        if (auth()->user()->isInstructor()) {
            $query->where('uploaded_by_user_id', auth()->id());
        }
        if (!empty($validated['course_id'])) {
            $query->where('course_id', (int)$validated['course_id']);
        }

        if (!empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (!empty($validated['q'])) {
            $q = $validated['q'];
            $query->where('filename', 'like', '%' . $q . '%');
        }

        $paginator = $query->paginate($perPage);

        $items = $paginator->getCollection()->map(function (MediaAsset $a) {
            $disk = $a->disk ?: 'public';
            $url = $a->path ? Storage::disk($disk)->url($a->path) : null;
            return [
                'id' => $a->id,
                'course_id' => $a->course_id,
                'uploaded_by_user_id' => $a->uploaded_by_user_id,
                'disk' => $a->disk,
                'type' => $a->type,
                'path' => $a->path,
                'url' => $url,
                'filename' => $a->filename,
                'mime_type' => $a->mime_type,
                'size' => $a->size,
                'created_at' => $a->created_at,
            ];
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $asset = MediaAsset::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $asset->uploaded_by_user_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți șterge doar fișierele încărcate de tine.');
        }

        if ($asset->path) {
            Storage::disk($asset->disk ?: 'public')->delete($asset->path);
        }

        $asset->delete();

        return response()->json([
            'message' => 'Media deleted',
        ]);
    }
}

