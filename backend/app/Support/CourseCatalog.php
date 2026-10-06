<?php

namespace App\Support;

use App\Models\Course;
use Illuminate\Database\Eloquent\Builder;

/**
 * Cursuri publicate vizibile în catalog fără a fi într-o mapă de cursuri.
 *
 * SETTINGS_KEY („Și în catalogul Cursuri” la publicare) e păstrat în setări, dar nu mai decide afișarea.
 */
class CourseCatalog
{
    public const SETTINGS_KEY = 'catalog_outside_map';

    public static function applyOutsideMapFlag(Course $course, bool $value): Course
    {
        if (! SchemaCache::hasColumn('courses', 'settings')) {
            return $course;
        }

        $settings = is_array($course->settings) ? $course->settings : [];
        $settings[self::SETTINGS_KEY] = $value;
        $course->update(['settings' => $settings]);

        return $course->fresh();
    }

    /**
     * Cursuri publicate care nu sunt în nicio mapă vizibilă cursanților (mapa implicită „Cursuri fara mapa”
     * și mapele private nu contează). Ele apar în afara mapelor; un curs dintr-o mapă apare doar în mapă.
     */
    public static function standalonePublishedQuery(): Builder
    {
        $defaultIds = CourseMapBuckets::defaultMapIds();
        $hasVisibility = SchemaCache::hasColumn('course_maps', 'visibility');

        return Course::query()
            ->where('status', 'published')
            ->whereDoesntHave('courseMaps', function ($maps) use ($defaultIds, $hasVisibility) {
                if ($defaultIds !== []) {
                    $maps->whereNotIn('course_maps.id', $defaultIds);
                }
                if ($hasVisibility) {
                    $maps->where(fn ($q) => $q->where('course_maps.visibility', 'public')->orWhereNull('course_maps.visibility'));
                }
            });
    }
}
