<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CourseMap;
use App\Models\Course;
use App\Support\CourseMapBuckets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CourseMapAdminController extends Controller
{
    /**
     * Lista mape de curs. Instructor: doar mapele create de el.
     */
    public function index(Request $request)
    {
        $query = CourseMap::with([
            'createdBy:id,name,email',
            'courses' => function ($q) {
                $q->orderBy('course_map_course.order');
            },
        ])
            ->withCount('courses');

        if (auth()->user()->isInstructor()) {
            $query->where('created_by', auth()->id());
        }

        if ($request->has('search') && $request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('description', 'like', "%{$s}%");
            });
        }

        $maps = $query->orderBy('order')->orderBy('name')->paginate($request->get('per_page', 20));

        if ($request->boolean('include_virtual')) {
            $unassignedQuery = CourseMapBuckets::defaultBucketQuery(publishedOnly: false);
            if (auth()->user()->isInstructor()) {
                $unassignedQuery->where('teacher_id', auth()->id());
            }
            $unassignedCount = (int) $unassignedQuery->count();
            if ($unassignedCount > 0) {
                $maps->setCollection(
                    $maps->getCollection()->push([
                        'id' => 'unassigned',
                        'name' => 'Fără mapă',
                        'description' => 'Cursuri neasociate unei mape.',
                        'courses_count' => $unassignedCount,
                        'is_virtual' => true,
                        'accent_color' => '#64748b',
                        'cover_image_url' => null,
                    ])
                );
            }
        }

        return response()->json($maps);
    }

    /**
     * Detalii mapă + cursuri ordonate.
     */
    public function show($id)
    {
        if ((string) $id === 'unassigned') {
            return $this->showUnassignedMap();
        }

        $map = CourseMap::with(['createdBy:id,name,email', 'courses' => fn ($q) => $q->orderBy('course_map_course.order')])
            ->withCount('courses')
            ->findOrFail($id);

        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți accesa doar mapele tale.');
        }

        return response()->json($map);
    }

    private function showUnassignedMap()
    {
        $query = CourseMapBuckets::defaultBucketQuery(publishedOnly: false)
            ->with(['teacher:id,name', 'modules:id,course_id,estimated_duration_minutes'])
            ->orderBy('title');

        if (auth()->user()->isInstructor()) {
            $query->where('teacher_id', auth()->id());
        }

        $courses = $query->get()->map(function ($course) {
            $durationMinutes = 0;
            foreach ($course->modules ?? [] as $module) {
                $durationMinutes += (int) ($module->estimated_duration_minutes ?? 0);
            }

            return [
                'id' => $course->id,
                'title' => $course->title,
                'short_description' => $course->short_description,
                'image_url' => $course->image_url ?? $course->image,
                'estimated_duration_minutes' => $durationMinutes,
                'views_count' => \App\Support\CourseViews::countForCourse($course),
                'progress_percentage' => 0,
                'completed_at' => null,
                'teacher' => $course->teacher ? ['id' => $course->teacher->id, 'name' => $course->teacher->name] : null,
            ];
        })->values();

        return response()->json([
            'id' => 'unassigned',
            'name' => 'Fără mapă',
            'description' => 'Cursuri neasociate unei mape.',
            'courses' => $courses,
            'is_virtual' => true,
        ]);
    }

    /**
     * Creare mapă. created_by = user curent.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'visibility' => 'nullable|in:public,private',
            'order' => 'nullable|integer|min:0',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $validated['created_by'] = auth()->id();
        $validated['order'] = $validated['order'] ?? 0;
        $validated['visibility'] = auth()->user()->isAdmin()
            ? ($validated['visibility'] ?? 'public')
            : 'public';

        $map = CourseMap::create($validated);
        $map->load('createdBy:id,name,email');
        $map->loadCount('courses');

        return response()->json($map, 201);
    }

    /**
     * Actualizare mapă. Instructor: doar mapele proprii.
     */
    public function update(Request $request, $id)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:5000',
            'order' => 'nullable|integer|min:0',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $map->update($validated);
        $map->load('createdBy:id,name,email');
        $map->loadCount('courses');

        return response()->json($map);
    }

    /**
     * Ștergere mapă.
     */
    public function destroy($id)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $map->delete();
        return response()->json(null, 204);
    }

    /**
     * Adaugă cursuri în mapă. Body: { course_ids: [1,2,3] }.
     * Instructor: doar cursuri unde teacher_id = auth.
     */
    public function attachCourses(Request $request, $id)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $courseIds = $request->validate(['course_ids' => 'required|array', 'course_ids.*' => 'integer|exists:courses,id'])['course_ids'];

        if (auth()->user()->isInstructor()) {
            $allowed = Course::where('teacher_id', auth()->id())->pluck('id')->toArray();
            $courseIds = array_values(array_intersect($courseIds, $allowed));
        }

        $targetIsDefaultMap = CourseMapBuckets::isDefaultMapId((int) $map->id);
        $maxOrder = $map->courses()->max('course_map_course.order') ?? 0;
        foreach ($courseIds as $i => $courseId) {
            $map->courses()->syncWithoutDetaching([$courseId => ['order' => $maxOrder + $i + 1]]);
            if (! $targetIsDefaultMap) {
                CourseMapBuckets::detachCourseFromDefaultMaps((int) $courseId);
            }
        }

        $map->load(['courses' => fn ($q) => $q->orderBy('course_map_course.order')]);
        $map->loadCount('courses');
        return response()->json($map);
    }

    /**
     * Scoate un curs din mapă.
     */
    public function detachCourse($id, $courseId)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $map->courses()->detach($courseId);

        $course = Course::find($courseId);
        if ($course && ! CourseMapBuckets::isDefaultMapId((int) $map->id)) {
            $ownerId = (int) ($course->teacher_id ?: auth()->id());
            CourseMapBuckets::attachCourseToDefaultMap($course, $ownerId);
        }

        return response()->json(null, 204);
    }

    /**
     * Reordonare cursuri în mapă. Body: { order: [ { course_id: 1, order: 0 }, ... ] }.
     */
    public function reorderCourses(Request $request, $id)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $order = $request->validate([
            'order' => 'required|array',
            'order.*.course_id' => 'required|integer|exists:courses,id',
            'order.*.order' => 'required|integer|min:0',
        ])['order'];

        foreach ($order as $item) {
            $map->courses()->updateExistingPivot($item['course_id'], ['order' => $item['order']]);
        }

        $map->load(['courses' => fn ($q) => $q->orderBy('course_map_course.order')]);
        $map->loadCount('courses');
        return response()->json($map);
    }

    /**
     * Reordonare mape (ID-uri în ordinea dorită).
     */
    public function reorderMaps(Request $request)
    {
        $validated = $request->validate([
            'map_ids' => 'required|array',
            'map_ids.*' => 'integer|exists:course_maps,id',
        ]);

        $mapIds = $validated['map_ids'];
        foreach ($mapIds as $index => $mapId) {
            $map = CourseMap::query()->find($mapId);
            if (!$map) {
                continue;
            }
            if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
                abort(403, 'Acces interzis.');
            }
            $map->update(['order' => $index]);
        }

        return response()->json(['message' => 'Ordinea mape a fost salvată']);
    }

    public function uploadCover(Request $request, $id)
    {
        $request->validate([
            'cover' => 'required|image|mimes:jpeg,png,gif,webp|max:4096',
        ]);

        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $file = $request->file('cover');
        $ext = $file->getClientOriginalExtension() ?: 'jpg';
        $path = $file->storeAs('course-map-covers', $map->id . '_' . time() . '.' . $ext, 'public');

        if ($map->cover_image_path) {
            try {
                Storage::disk('public')->delete($map->cover_image_path);
            } catch (\Exception $e) {
                Log::warning('Could not delete old course map cover: ' . $e->getMessage());
            }
        }

        $map->cover_image_path = $path;
        $map->save();
        $map->load('createdBy:id,name,email');
        $map->loadCount('courses');

        return response()->json($map);
    }

    public function deleteCover($id)
    {
        $map = CourseMap::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $map->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        if ($map->cover_image_path) {
            try {
                Storage::disk('public')->delete($map->cover_image_path);
            } catch (\Exception $e) {
                Log::warning('Could not delete course map cover: ' . $e->getMessage());
            }
            $map->cover_image_path = null;
            $map->save();
        }

        $map->load('createdBy:id,name,email');
        $map->loadCount('courses');

        return response()->json($map);
    }
}
