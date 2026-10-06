<?php

namespace App\Support;

use App\Models\Course;

class CourseViews
{
    /**
     * Increment course view counter (student/guest access to published content).
     */
    public static function recordView(Course $course, bool $isStaff): void
    {
        if ($isStaff || ! SchemaCache::hasColumn('courses', 'views_count')) {
            return;
        }

        if (SchemaCache::hasColumn('courses', 'status') && ($course->status ?? 'draft') !== 'published') {
            return;
        }

        $course->increment('views_count');
    }

    public static function countForCourse(Course $course): int
    {
        if (! SchemaCache::hasColumn('courses', 'views_count')) {
            return 0;
        }

        return (int) ($course->views_count ?? 0);
    }
}
