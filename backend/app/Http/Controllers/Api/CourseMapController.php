<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseMap;
use App\Services\CourseProgressService;
use App\Support\CourseMapBuckets;
use App\Support\LearningVisibility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;

/**
 * Course maps for students: list and show only maps that contain published courses.
 */
class CourseMapController extends Controller
{
    /**
     * Lista mape de curs vizibile pentru student (doar mape care au cel puțin un curs publicat).
     */
    public function index(Request $request)
    {
        if (!SchemaCache::hasTable('course_maps') || !SchemaCache::hasTable('course_map_course')) {
            return response()->json(['data' => []]);
        }

        $defaultMapIds = $this->defaultMapIds();
        $assignedIds = LearningVisibility::assignedCourseIdsForLearner($request->user());
        $completedIds = $assignedIds === null ? [] : $this->learnerCompletedCourseIds($request->user());

        $query = CourseMap::query()
            ->when(
                SchemaCache::hasColumn('course_maps', 'visibility'),
                fn ($q) => $q->where(fn ($inner) => $inner->where('visibility', 'public')->orWhereNull('visibility'))
            )
            ->whereHas('courses', function ($q) use ($assignedIds, $completedIds) {
                $this->publishedAssignedCourseScope($q, $assignedIds, $completedIds);
            })
            ->withCount(['courses' => function ($q) use ($assignedIds, $completedIds) {
                $this->publishedAssignedCourseScope($q, $assignedIds, $completedIds);
            }])
            ->orderBy('order')
            ->orderBy('name');

        $mapsCollection = $query->get()->reject(
            fn (CourseMap $map) => in_array((int) $map->id, $defaultMapIds, true)
        );
        $mapIds = $mapsCollection->pluck('id')->all();
        $hasCoverCol = SchemaCache::hasColumn('course_maps', 'cover_image_path');
        $previewByMapId = $hasCoverCol ? $this->firstPublishedCourseCoverByMapIds($mapIds, $assignedIds) : [];
        $progressByMapId = $this->mapProgressPercentages($request->user(), $mapIds);

        $maps = $mapsCollection->map(function ($map) use ($hasCoverCol, $previewByMapId, $progressByMapId) {
            $row = [
                'id' => $map->id,
                'name' => $map->name,
                'description' => $map->description,
                'courses_count' => $map->courses_count ?? 0,
                'progress_percentage' => $progressByMapId[(int) $map->id] ?? 0,
            ];
            if (SchemaCache::hasColumn('course_maps', 'accent_color')) {
                $row['accent_color'] = $map->accent_color;
            }
            if ($hasCoverCol) {
                $row['cover_image_url'] = $map->cover_image_url;
                if (SchemaCache::hasColumn('course_maps', 'cover_focus')) {
                    $row['cover_focus'] = CourseMap::normalizeCoverFocus($map->cover_focus);
                }
                $cover = $map->cover_image_url;
                if ($cover === null || $cover === '') {
                    $row['preview_image_url'] = $previewByMapId[$map->id] ?? null;
                }
            }

            return $row;
        })->values();

        return response()->json(['data' => $maps->values()]);
    }

    /**
     * Detalii mapă + cursuri publicate, cu progres utilizator și durată estimată.
     */
    public function show(Request $request, $id)
    {
        if (!SchemaCache::hasTable('course_maps') || !SchemaCache::hasTable('course_map_course')) {
            return response()->json(['error' => 'Mapă negăsită'], 404);
        }

        if ($this->isDefaultStudentMapId($id)) {
            abort(404, 'Mapă negăsită.');
        }

        $user = $request->user();
        $assignedIds = LearningVisibility::assignedCourseIdsForLearner($user);

        $map = CourseMap::with([
            'courses' => function ($q) use ($assignedIds) {
                $this->publishedAssignedCourseScope($q, $assignedIds);
                $q->orderBy('course_map_course.order')
                    ->with(['teacher:id,name', 'modules:id,course_id,estimated_duration_minutes']);
            },
        ])->findOrFail($id);

        if (
            SchemaCache::hasColumn('course_maps', 'visibility')
            && ($map->visibility ?? 'public') === 'private'
        ) {
            abort(404, 'Mapă negăsită.');
        }

        if ($assignedIds !== null && $map->courses->isEmpty()) {
            abort(404, 'Mapă negăsită.');
        }

        $progress = $this->liveProgressByCourses($user, $map->courses);
        $courses = $this->mapPublishedCoursesPayload($map->courses, $progress);
        $assignedPercents = [];
        foreach ($progress as $row) {
            if (!empty($row['assigned'])) {
                $assignedPercents[] = (int) ($row['progress_percentage'] ?? 0);
            }
        }

        $payload = [
            'id' => $map->id,
            'name' => $map->name,
            'description' => $map->description,
            'courses' => $courses,
            'progress_percentage' => $assignedPercents === []
                ? 0
                : (int) round(array_sum($assignedPercents) / count($assignedPercents)),
        ];
        if (SchemaCache::hasColumn('course_maps', 'accent_color')) {
            $payload['accent_color'] = $map->accent_color;
        }
        if (SchemaCache::hasColumn('course_maps', 'header_bg_color')) {
            $payload['header_bg_color'] = $map->header_bg_color;
        }
        if (SchemaCache::hasColumn('course_maps', 'header_text_color')) {
            $payload['header_text_color'] = $map->header_text_color;
        }
        if (SchemaCache::hasColumn('course_maps', 'cover_image_path')) {
            $payload['cover_image_url'] = $map->cover_image_url;
            if (SchemaCache::hasColumn('course_maps', 'cover_focus')) {
                $payload['cover_focus'] = CourseMap::normalizeCoverFocus($map->cover_focus);
            }
        }

        return response()->json($payload);
    }

    /**
     * @return array<int>
     */
    private function defaultMapIds(): array
    {
        return CourseMapBuckets::defaultMapIds();
    }

    private function isDefaultStudentMapId(mixed $id): bool
    {
        if ((string) $id === 'unassigned') {
            return true;
        }

        if (!is_numeric($id)) {
            return false;
        }

        return in_array((int) $id, $this->defaultMapIds(), true);
    }

    /**
     * @param  array<int>  $mapIds
     * @return array<int, int>
     */
    private function mapProgressPercentages($user, array $mapIds): array
    {
        $out = [];
        foreach ($mapIds as $mapId) {
            $out[(int) $mapId] = 0;
        }
        if (!$user || $mapIds === []) {
            return $out;
        }

        $links = DB::table('course_map_course')
            ->join('courses', 'courses.id', '=', 'course_map_course.course_id')
            ->whereIn('course_map_course.course_map_id', $mapIds)
            ->where('courses.status', 'published')
            ->get([
                'course_map_course.course_map_id as map_id',
                'course_map_course.course_id as course_id',
            ]);

        $courseIds = $links->pluck('course_id')->unique()->map(fn ($id) => (int) $id)->all();
        if ($courseIds === []) {
            return $out;
        }

        $progress = $this->liveProgressByCourses(
            $user,
            Course::query()->whereIn('id', $courseIds)->get()
        );

        $sums = [];
        $counts = [];
        foreach ($links as $link) {
            $mapId = (int) $link->map_id;
            $courseId = (int) $link->course_id;
            $row = $progress[$courseId] ?? null;
            if (!$row || empty($row['assigned'])) {
                continue;
            }
            $sums[$mapId] = ($sums[$mapId] ?? 0) + (int) $row['progress_percentage'];
            $counts[$mapId] = ($counts[$mapId] ?? 0) + 1;
        }

        foreach ($counts as $mapId => $count) {
            $out[$mapId] = $count > 0 ? (int) round($sums[$mapId] / $count) : 0;
        }

        return $out;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Course>|iterable<Course>  $courses
     * @return array<int, array{progress_percentage: int, completed_at: mixed, assigned: bool}>
     */
    private function liveProgressByCourses($user, $courses): array
    {
        $progress = [];
        if (!$user) {
            return $progress;
        }

        $courseModels = collect($courses)->filter()->keyBy(fn (Course $course) => (int) $course->id);
        $courseIds = $courseModels->keys()->all();
        if ($courseIds === []) {
            return $progress;
        }

        $assignedRows = DB::table('course_user')
            ->where('user_id', $user->id)
            ->whereIn('course_id', $courseIds)
            ->get(['course_id', 'completed_at'])
            ->keyBy('course_id');

        $progressService = app(CourseProgressService::class);
        foreach ($courseModels as $courseId => $course) {
            $assigned = $assignedRows->has($courseId);
            $percent = $assigned
                ? (int) round($progressService->calculateCourseProgress($user, $course))
                : 0;
            $completedAt = $assigned
                ? DB::table('course_user')
                    ->where('user_id', $user->id)
                    ->where('course_id', $courseId)
                    ->value('completed_at')
                : null;
            $progress[$courseId] = [
                'progress_percentage' => $percent,
                'completed_at' => $completedAt,
                'assigned' => $assigned,
            ];
        }

        return $progress;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Course>  $courses
     * @param  array<int, array{progress_percentage: int, completed_at: mixed}>  $progress
     */
    private function mapPublishedCoursesPayload($courses, array $progress)
    {
        return $courses->map(function ($course) use ($progress) {
            $p = $progress[$course->id] ?? ['progress_percentage' => 0, 'completed_at' => null];
            $durationMinutes = $this->courseDurationMinutes($course);

            return [
                'id' => $course->id,
                'title' => $course->title,
                'short_description' => $course->short_description,
                'image_url' => $course->image_url ?? $course->image,
                'estimated_duration_minutes' => $durationMinutes,
                'views_count' => \App\Support\CourseViews::countForCourse($course),
                'progress_percentage' => $p['progress_percentage'],
                'completed_at' => $p['completed_at'],
                'teacher' => $course->teacher ? ['id' => $course->teacher->id, 'name' => $course->teacher->name] : null,
            ];
        })->values();
    }

    /**
     * @return array<int>
     */
    private function learnerCompletedCourseIds($user): array
    {
        if (! $user || ! SchemaCache::hasTable('course_user')) {
            return [];
        }

        return DB::table('course_user')
            ->where('user_id', $user->id)
            ->whereNotNull('completed_at')
            ->pluck('course_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder|\Illuminate\Database\Eloquent\Relations\Relation  $query
     * @param  array<int>|null  $assignedIds
     * @param  array<int>  $completedIds
     */
    private function publishedAssignedCourseScope($query, ?array $assignedIds, array $completedIds = []): void
    {
        $query->where('courses.status', 'published');
        if ($assignedIds !== null) {
            $query->whereIn('courses.id', $assignedIds);
        }
        if ($completedIds !== []) {
            $query->whereNotIn('courses.id', $completedIds);
        }
    }

    /**
     * Prima copertă de curs publicat din mapă (ordine pivot), pentru cardul din listă când mapa n-are copertă proprie.
     *
     * @param  array<int>  $mapIds
     * @param  array<int>|null  $assignedIds
     * @return array<int, string|null>
     */
    private function firstPublishedCourseCoverByMapIds(array $mapIds, ?array $assignedIds = null): array
    {
        if ($mapIds === []) {
            return [];
        }

        $rows = DB::table('course_map_course')
            ->join('courses', 'courses.id', '=', 'course_map_course.course_id')
            ->whereIn('course_map_course.course_map_id', $mapIds)
            ->where('courses.status', 'published')
            ->when($assignedIds !== null, fn ($q) => $q->whereIn('courses.id', $assignedIds))
            ->whereNotNull('courses.image')
            ->where('courses.image', '!=', '')
            ->orderBy('course_map_course.course_map_id')
            ->orderBy('course_map_course.order')
            ->select([
                'course_map_course.course_map_id as map_id',
                'courses.image as course_image',
            ])
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $mid = (int) $row->map_id;
            if (array_key_exists($mid, $out)) {
                continue;
            }
            $out[$mid] = Course::make(['image' => $row->course_image])->image_url;
        }

        return $out;
    }

    private function courseDurationMinutes($course): int
    {
        if ($course->estimated_duration_hours) {
            return (int) $course->estimated_duration_hours * 60;
        }
        if ($course->relationLoaded('modules') && $course->modules->isNotEmpty()) {
            $total = 0;
            foreach ($course->modules as $module) {
                $total += (int) ($module->estimated_duration_minutes ?? 0);
            }
            if ($total > 0) {
                return $total;
            }
        }
        return 0;
    }
}
