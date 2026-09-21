<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Company;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CourseEnrollmentService
{
    /**
     * Enroll a user in a course, preserving the original enrolled_at when re-enrolling.
     * Callers should be assignment flows (manual, team, department), not course access.
     *
     * @return bool True when enrollment was newly activated.
     */
    public function enroll(User $user, Course $course, array $extraPivot = []): bool
    {
        if (! Schema::hasTable('course_user')) {
            return false;
        }

        if ($user->company_id) {
            $company = Company::withoutGlobalScopes()->find($user->company_id);
            if ($company && ! $company->isUsable()) {
                throw new \RuntimeException('Compania nu este activă.');
            }
        }

        $existing = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first();

        $wasEnrolled = $existing && (bool) ($existing->enrolled ?? false);
        $enrolledAt = $existing->enrolled_at ?? now();

        $pivot = array_merge([
            'enrolled' => true,
            'enrolled_at' => $enrolledAt,
            'updated_at' => now(),
        ], $extraPivot);

        unset($pivot['progress_percentage'], $pivot['completed_at'], $pivot['started_at'], $pivot['manually_completed']);

        if ($existing) {
            unset($pivot['created_at'], $pivot['enrolled_at']);
            $pivot['enrolled_at'] = $enrolledAt;
        }

        if (! $existing) {
            $pivot['created_at'] = now();
        }

        DB::table('course_user')->updateOrInsert(
            [
                'user_id' => $user->id,
                'course_id' => $course->id,
            ],
            $pivot
        );

        return ! $wasEnrolled;
    }

    public function getEnrolledAt(User $user, Course $course): ?Carbon
    {
        if (! Schema::hasTable('course_user')) {
            return null;
        }

        $row = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->first(['enrolled_at']);

        if (! $row || empty($row->enrolled_at)) {
            return null;
        }

        return Carbon::parse($row->enrolled_at);
    }
}
