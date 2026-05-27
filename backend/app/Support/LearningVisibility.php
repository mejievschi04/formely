<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class LearningVisibility
{
    public static function isStaff(?User $user): bool
    {
        return $user && in_array($user->role ?? '', ['admin', 'instructor'], true);
    }

    public static function isStaffRequest(Request $request): bool
    {
        return self::isStaff($request->user());
    }

    public static function courseVisibleToLearner(?User $user, object $course): bool
    {
        if (self::isStaff($user)) {
            return true;
        }

        if (! Schema::hasColumn('courses', 'status')) {
            return true;
        }

        return ($course->status ?? 'draft') === 'published';
    }

    public static function applyPublishedCourseFilter($query, bool $isStaff): void
    {
        if (! $isStaff && Schema::hasColumn('courses', 'status')) {
            $query->where('status', 'published');
        }
    }

    public static function publishedLessonScope($query, bool $isStaff): void
    {
        $query->orderBy('order');
        if (! $isStaff && Schema::hasColumn('lessons', 'status')) {
            $query->where('status', 'published');
        }
    }

    public static function publishedModuleScope($query, bool $isStaff): void
    {
        $query->orderBy('order');
        if (! $isStaff && Schema::hasColumn('modules', 'status')) {
            $query->where('status', 'published');
        }
    }
}
