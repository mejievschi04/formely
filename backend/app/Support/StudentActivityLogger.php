<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\Course;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StudentActivityLogger
{
    public static function logEnrolledCourse(User $user, Course $course, string $source = 'manual'): void
    {
        if ($user->isLearningActivityExempt()) {
            return;
        }

        if (self::hasActionForModel($user->id, 'enrolled_course', 'Course', $course->id)) {
            return;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'enrolled_course',
            'model_type' => 'Course',
            'model_id' => $course->id,
            'description' => "{$user->name} s-a înscris la cursul \"{$course->title}\"",
            'new_values' => [
                'course_id' => $course->id,
                'course_title' => $course->title,
                'source' => $source,
                'enrolled_at' => now()->toDateTimeString(),
            ],
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
        ]);
    }

    /**
     * @return bool True if a new completed_course log was written.
     */
    public static function logCompletedCourseIfFirst(User $user, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return false;
        }

        if (self::hasActionForModel($user->id, 'completed_course', 'Course', $course->id)) {
            return false;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'completed_course',
            'model_type' => 'Course',
            'model_id' => $course->id,
            'description' => "{$user->name} a finalizat cursul \"{$course->title}\"",
            'new_values' => [
                'course_id' => $course->id,
                'course_title' => $course->title,
                'progress_percentage' => 100,
                'completed_at' => now()->toDateTimeString(),
            ],
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
        ]);

        return true;
    }

    /**
     * Log exam/test completion only on first passing attempt for that assessment.
     */
    public static function logCompletedExamIfFirstPass(
        User $user,
        string $modelType,
        int $modelId,
        string $description,
        array $newValues
    ): bool {
        if ($user->isLearningActivityExempt()) {
            return false;
        }

        if (empty($newValues['passed'])) {
            return false;
        }

        if (self::hasActionForModel($user->id, 'completed_exam', $modelType, $modelId)) {
            return false;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'completed_exam',
            'model_type' => $modelType,
            'model_id' => $modelId,
            'description' => $description,
            'new_values' => $newValues,
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
        ]);

        return true;
    }

    public static function hasActionForModel(int $userId, string $action, string $modelType, int $modelId): bool
    {
        return ActivityLog::query()
            ->where('user_id', $userId)
            ->where('action', $action)
            ->where('model_id', $modelId)
            ->where(function ($q) use ($modelType) {
                $q->where('model_type', $modelType)
                    ->orWhere('model_type', 'App\\Models\\' . $modelType);
            })
            ->exists();
    }

    public static function courseWasAlreadyCompleted(int $userId, int $courseId): bool
    {
        if (! DB::getSchemaBuilder()->hasTable('course_user')) {
            return false;
        }

        return DB::table('course_user')
            ->where('user_id', $userId)
            ->where('course_id', $courseId)
            ->whereNotNull('completed_at')
            ->exists();
    }
}
