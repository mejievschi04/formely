<?php

namespace App\Services;

use App\Models\ContentBlock;
use App\Models\Course;
use App\Models\CourseVersion;
use App\Models\Lesson;
use App\Models\Module;
use App\Support\LearningVisibility;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class PublishedCourseView
{
    public function shouldServeSnapshot(?Course $course, ?Request $request = null): bool
    {
        if (! $course) {
            return false;
        }
        if ($request && LearningVisibility::isStaffRequest($request)) {
            return false;
        }
        if (($course->status ?? '') !== 'published') {
            return false;
        }

        return ($course->workflow_status ?? 'published') === 'editing';
    }

    public function latestPublishedSnapshot(int $courseId): ?array
    {
        $version = CourseVersion::query()
            ->with('snapshot')
            ->where('course_id', $courseId)
            ->where('status', 'published')
            ->orderByDesc('version')
            ->first();

        $json = $version?->snapshot?->snapshot_json;

        return is_array($json) ? $json : null;
    }

    public function liveTestIds(?Course $course, ?Request $request = null): ?array
    {
        if (! $this->shouldServeSnapshot($course, $request)) {
            return null;
        }

        $snapshot = $this->latestPublishedSnapshot((int) $course->id);
        if (! is_array($snapshot)) {
            return [];
        }

        return collect($snapshot['course_tests'] ?? [])
            ->filter(fn ($item) => is_array($item))
            ->map(fn ($item) => (int) ($item['test_id'] ?? 0))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    public function learnerMayAccessLinkedTest(?Course $course, int $testId, ?Request $request = null): bool
    {
        $ids = $this->liveTestIds($course, $request);
        if ($ids === null) {
            return true;
        }

        return in_array($testId, $ids, true);
    }

    public function overlayLesson(Lesson $lesson, ?array $snapshot): ?Lesson
    {
        if (! is_array($snapshot)) {
            return $lesson;
        }

        $row = collect($snapshot['lessons'] ?? [])->first(
            fn ($item) => is_array($item) && (int) ($item['id'] ?? 0) === (int) $lesson->id
        );
        if (! is_array($row)) {
            return null;
        }

        $lesson->title = $row['title'] ?? $lesson->title;
        $lesson->content = $row['content'] ?? $lesson->content;
        $lesson->video_url = $row['video_url'] ?? $lesson->video_url;
        $lesson->order = $row['order'] ?? $lesson->order;
        $lesson->module_id = $row['module_id'] ?? $lesson->module_id;
        $lesson->setRelation('contentBlocks', $this->blocksForLesson($snapshot, (int) $lesson->id));

        return $lesson;
    }

    public function filterCourseLessons(Course $course, ?array $snapshot): Course
    {
        if (! is_array($snapshot)) {
            return $course;
        }

        $this->overlayCourseMetadata($course, $snapshot);

        $existingLessons = collect();
        if ($course->relationLoaded('lessons')) {
            $existingLessons = $existingLessons->merge($course->lessons);
        }
        if ($course->relationLoaded('modules')) {
            foreach ($course->modules as $module) {
                if ($module->relationLoaded('lessons')) {
                    $existingLessons = $existingLessons->merge($module->lessons);
                }
            }
        }
        $lessonsById = $existingLessons->keyBy(fn (Lesson $lesson) => (int) $lesson->id);
        $existingModules = $course->relationLoaded('modules')
            ? $course->modules->keyBy(fn (Module $module) => (int) $module->id)
            : collect();

        $modules = collect($snapshot['modules'] ?? [])
            ->filter(fn ($item) => is_array($item))
            ->sortBy(fn ($item) => (int) ($item['order'] ?? 0))
            ->map(function (array $row) use ($existingModules, $lessonsById, $snapshot) {
                $id = (int) ($row['id'] ?? 0);
                $module = $existingModules->get($id) ?? $this->hydrateModule($row);
                $module->title = $row['title'] ?? $module->title;
                $module->description = $row['description'] ?? $module->description;
                $module->order = $row['order'] ?? $module->order;
                $moduleLessons = collect($snapshot['lessons'] ?? [])
                    ->filter(fn ($item) => is_array($item) && (int) ($item['module_id'] ?? 0) === $id)
                    ->sortBy(fn ($item) => (int) ($item['order'] ?? 0))
                    ->map(fn (array $item) => $this->resolveLesson($item, $lessonsById, $snapshot))
                    ->filter()
                    ->values();
                $module->setRelation('lessons', $moduleLessons);

                return $module;
            })
            ->values();

        $roots = collect($snapshot['lessons'] ?? [])
            ->filter(fn ($item) => is_array($item) && empty($item['module_id']))
            ->sortBy(fn ($item) => (int) ($item['order'] ?? 0))
            ->map(fn (array $item) => $this->resolveLesson($item, $lessonsById, $snapshot))
            ->filter()
            ->values();

        if ($course->relationLoaded('modules') || $modules->isNotEmpty()) {
            $course->setRelation('modules', $modules);
        }
        if ($course->relationLoaded('lessons') || $roots->isNotEmpty()) {
            $course->setRelation('lessons', $roots);
        }

        return $course;
    }

    public function hydratePublishedLesson(int $lessonId, ?Request $request = null): ?Lesson
    {
        $versions = CourseVersion::query()
            ->with(['snapshot', 'course'])
            ->where('status', 'published')
            ->orderByDesc('id')
            ->get();

        foreach ($versions as $version) {
            $course = $version->course;
            if (! $this->shouldServeSnapshot($course, $request)) {
                continue;
            }
            $snapshot = is_array($version->snapshot?->snapshot_json) ? $version->snapshot->snapshot_json : null;
            $row = collect($snapshot['lessons'] ?? [])->first(
                fn ($item) => is_array($item) && (int) ($item['id'] ?? 0) === $lessonId
            );
            if (! is_array($row)) {
                continue;
            }
            $lesson = $this->hydrateLesson($row);
            $overlaid = $this->overlayLesson($lesson, $snapshot);
            if ($overlaid) {
                $overlaid->setRelation('course', $course);

                return $overlaid;
            }
        }

        return null;
    }

    public function overlayCourseMetadata(Course $course, ?array $snapshot): Course
    {
        $row = is_array($snapshot) ? ($snapshot['course'] ?? null) : null;
        if (! is_array($row)) {
            return $course;
        }

        foreach (['title', 'description', 'short_description', 'category', 'level', 'image', 'card_color'] as $key) {
            if (array_key_exists($key, $row)) {
                $course->{$key} = $row[$key];
            }
        }

        return $course;
    }

    private function resolveLesson(array $row, Collection $lessonsById, array $snapshot): ?Lesson
    {
        $id = (int) ($row['id'] ?? 0);
        $lesson = $lessonsById->get($id) ?? $this->hydrateLesson($row);

        return $this->overlayLesson($lesson, $snapshot);
    }

    private function hydrateLesson(array $row): Lesson
    {
        $lesson = new Lesson();
        $lesson->forceFill(array_intersect_key($row, array_flip($lesson->getFillable())));
        $lesson->id = $row['id'] ?? null;
        $lesson->exists = true;

        return $lesson;
    }

    private function hydrateModule(array $row): Module
    {
        $module = new Module();
        $module->forceFill(array_intersect_key($row, array_flip($module->getFillable())));
        $module->id = $row['id'] ?? null;
        $module->exists = true;

        return $module;
    }

    private function blocksForLesson(array $snapshot, int $lessonId): Collection
    {
        $blocks = collect($snapshot['content_blocks'] ?? [])
            ->filter(fn ($item) => is_array($item) && (int) ($item['lesson_id'] ?? 0) === $lessonId)
            ->sortBy(fn ($item) => (int) ($item['order'] ?? 0))
            ->values();

        return $blocks->map(function (array $row) {
            $block = new ContentBlock();
            $block->forceFill([
                'lesson_id' => $row['lesson_id'] ?? null,
                'type' => $row['type'] ?? 'text',
                'source' => $row['source'] ?? null,
                'payload' => $row['payload'] ?? null,
                'metadata' => $row['metadata'] ?? null,
                'order' => $row['order'] ?? 0,
                'visible' => $row['visible'] ?? true,
            ]);
            $block->id = $row['id'] ?? null;
            $block->exists = true;

            return $block;
        });
    }
}
