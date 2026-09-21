<?php

namespace App\Support;

use App\Models\Course;
use App\Models\CourseMap;
use Illuminate\Database\Eloquent\Builder;

/**
 * Shared definition for the default “unassigned” course bucket (student + admin).
 */
class CourseMapBuckets
{
    public const DEFAULT_MAP_NAME = 'Cursuri fara mapa';

    /**
     * @return array<int>
     */
    public static function defaultMapIds(): array
    {
        return CourseMap::query()
            ->where('name', self::DEFAULT_MAP_NAME)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public static function defaultMapRecord(): ?CourseMap
    {
        return CourseMap::query()
            ->where('name', self::DEFAULT_MAP_NAME)
            ->orderBy('id')
            ->first();
    }

    public static function isDefaultMapId(int $mapId): bool
    {
        return in_array($mapId, self::defaultMapIds(), true);
    }

    /**
     * Cursuri fără mapă „finală”: neatașate sau doar în mapa implicită admin.
     *
     * @param  bool  $publishedOnly  When true, matches the student-facing bucket.
     */
    public static function defaultBucketQuery(bool $publishedOnly = false): Builder
    {
        $defaultIds = self::defaultMapIds();

        $query = Course::query();

        if ($publishedOnly) {
            $query->where('status', 'published');
        }

        return $query->whereDoesntHave('courseMaps', function ($m) use ($defaultIds) {
            if ($defaultIds !== []) {
                $m->whereNotIn('course_maps.id', $defaultIds);
            }
        });
    }

    public static function detachCourseFromDefaultMaps(int $courseId): void
    {
        $defaultIds = self::defaultMapIds();
        if ($defaultIds === []) {
            return;
        }

        Course::query()->find($courseId)?->courseMaps()->detach($defaultIds);
    }

    /**
     * Pune cursul în mapa „Cursuri fara mapa” dacă nu e într-o mapă organizată.
     */
    public static function attachCourseToDefaultMap(Course $course, int $ownerUserId): void
    {
        $defaultIds = self::defaultMapIds();
        $hasOrganizedMap = $course->courseMaps()
            ->when($defaultIds !== [], fn ($q) => $q->whereNotIn('course_maps.id', $defaultIds))
            ->exists();

        if ($hasOrganizedMap) {
            return;
        }

        $map = CourseMap::firstOrCreate(
            [
                'name' => self::DEFAULT_MAP_NAME,
                'created_by' => $ownerUserId,
            ],
            [
                'description' => 'Cursuri create recent, neorganizate inca intr-o mapa finala.',
                'order' => 0,
            ]
        );

        if ($map->courses()->where('courses.id', $course->id)->exists()) {
            return;
        }

        $nextOrder = ((int) $map->courses()->max('course_map_course.order')) + 1;
        $map->courses()->attach($course->id, ['order' => $nextOrder]);
    }
}
