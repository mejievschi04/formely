<?php

namespace App\Support;

use App\Models\Course;
use Illuminate\Support\Facades\Schema;

class CourseViews
{
    /**
     * Increment course view counter (student/guest access to published content).
     */
    public static function recordView(Course $course, bool $isStaff): void
    {
        if ($isStaff || ! Schema::hasColumn('courses', 'views_count')) {
            return;
        }

        if (Schema::hasColumn('courses', 'status') && ($course->status ?? 'draft') !== 'published') {
            return;
        }

        $course->increment('views_count');
    }

    public static function countForCourse(Course $course): int
    {
        if (! Schema::hasColumn('courses', 'views_count')) {
            return 0;
        }

        return (int) ($course->views_count ?? 0);
    }
}
