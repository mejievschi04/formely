<?php

namespace App\Support;

use App\Models\Course;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Schema;

/**
 * Cursuri publicate vizibile în catalog fără a fi într-o mapă de cursuri.
 */
class CourseCatalog
{
    public const SETTINGS_KEY = 'catalog_outside_map';

    public static function isOutsideMap(Course $course): bool
    {
        if (! Schema::hasColumn('courses', 'settings')) {
            return false;
        }

        $settings = is_array($course->settings) ? $course->settings : [];

        return (bool) ($settings[self::SETTINGS_KEY] ?? false);
    }

    public static function applyOutsideMapFlag(Course $course, bool $value): Course
    {
        if (! Schema::hasColumn('courses', 'settings')) {
            return $course;
        }

        $settings = is_array($course->settings) ? $course->settings : [];
        $settings[self::SETTINGS_KEY] = $value;
        $course->update(['settings' => $settings]);

        return $course->fresh();
    }

    public static function standalonePublishedQuery(): Builder
    {
        $query = Course::query()->where('status', 'published');

        if (Schema::hasColumn('courses', 'settings')) {
            $query->where('settings->'.self::SETTINGS_KEY, true);
        } else {
            $query->whereRaw('1 = 0');
        }

        return $query;
    }
}
