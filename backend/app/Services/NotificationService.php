<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;

class NotificationService
{
    public function __construct(
        protected EmailNotificationService $emailNotificationService
    ) {}

    /**
     * Notify students when a course is published.
     *
     * @param  bool  $broadcastAllStudentsIfNoTargets  When true (builder publish fără echipe), notifică toți studenții.
     */
    public function notifyCoursePublished(Course $course, array $teamIds = [], bool $broadcastAllStudentsIfNoTargets = false): int
    {
        if (! SchemaCache::hasTable('notifications')) {
            return 0;
        }

        $userIds = $this->getTargetStudentIds($course, $teamIds, $broadcastAllStudentsIfNoTargets);
        $count = 0;
        $description = 'Cursul "' . $course->title . '" este acum disponibil.';
        $title = 'Curs nou disponibil';
        $actionUrl = '/courses/' . $course->id;
        $notifiedUserIds = [];

        foreach ($userIds as $userId) {
            if ($this->hasRecentCoursePublishedNotification((int) $userId, (int) $course->id)) {
                continue;
            }

            try {
                Notification::create([
                    'user_id' => $userId,
                    'type' => 'course_published',
                    'title' => $title,
                    'description' => $description,
                    'data' => ['course_id' => $course->id],
                    'action_url' => $actionUrl,
                    'severity' => 'info',
                ]);
                $count++;
                $notifiedUserIds[] = (int) $userId;
            } catch (\Throwable $e) {
                \Log::warning('NotificationService::notifyCoursePublished failed for user ' . $userId, [
                    'error' => $e->getMessage(),
                    'course_id' => $course->id,
                ]);
            }
        }

        if ($notifiedUserIds !== []) {
            $this->emailNotificationService->sendToMany(
                User::whereIn('id', $notifiedUserIds)->get(),
                $title,
                $description,
                $actionUrl,
                'Vezi cursul'
            );
        }

        return $count;
    }

    /**
     * Notify a student when an assigned test/course deadline is approaching.
     */
    public function notifyCourseEnrolled(User $student, Course $course): void
    {
        if (! SchemaCache::hasTable('notifications') || $student->isLearningActivityExempt()) {
            return;
        }

        $deadline = $this->resolveCourseDeadline($student, $course);
        if (! $deadline) {
            return;
        }

        if ($this->hasRecentNotification($student->id, 'course_deadline', ['course_id' => $course->id])) {
            return;
        }

        $title = 'Termenul expiră';
        $description = 'Cursul "' . $course->title . '" trebuie finalizat până la ' . $deadline . '.';
        $actionUrl = '/courses/' . $course->id;

        Notification::create([
            'user_id' => $student->id,
            'type' => 'course_deadline',
            'title' => $title,
            'description' => $description,
            'data' => ['course_id' => $course->id],
            'action_url' => $actionUrl,
            'severity' => 'warning',
        ]);

        $this->emailNotificationService->sendToUser($student, $title, $description, $actionUrl, 'Deschide cursul');
    }

    private function resolveCourseDeadline(User $student, Course $course): ?string
    {
        $settings = is_array($course->settings ?? null) ? $course->settings : [];
        $raw = $settings['deadline_at'] ?? $course->due_date ?? null;
        if (! $raw) {
            return null;
        }
        try {
            return \Carbon\Carbon::parse($raw)->timezone(config('app.timezone'))->format('d.m.Y H:i');
        } catch (\Throwable) {
            return is_string($raw) ? $raw : null;
        }
    }

    /**
     * Notify staff when a student completes a course.
     */
    public function notifyCourseCompleted(User $student, Course $course): void
    {
        if (! SchemaCache::hasTable('notifications')) {
            return;
        }

        $staffQuery = User::query()->whereIn('role', ['admin', 'instructor']);

        if ($course->teacher_id) {
            $staffQuery->where(function ($q) use ($course) {
                $q->where('role', 'admin')
                    ->orWhere('id', $course->teacher_id);
            });
        }

        $staffUsers = $staffQuery->get();
        $title = 'Curs finalizat';
        $description = $student->name . ' a finalizat cursul "' . $course->title . '"';
        $actionUrl = "/admin/courses/{$course->id}";

        foreach ($staffUsers as $staff) {
            Notification::create([
                'user_id' => $staff->id,
                'type' => 'course_completed',
                'title' => $title,
                'description' => $description,
                'data' => ['course_id' => $course->id, 'user_id' => $student->id],
                'action_url' => $actionUrl,
                'severity' => 'info',
            ]);
        }

        $this->emailNotificationService->sendToMany(
            $staffUsers,
            $title,
            $description,
            $actionUrl,
            'Vezi cursul'
        );
    }

    /**
     * Notify admins when someone requests registration (status pending).
     */
    public function notifyRegistrationRequested(User $user): void
    {
        if (! SchemaCache::hasTable('notifications')) {
            return;
        }

        $admins = User::where('role', 'admin')->get();
        $title = 'Cerere de înregistrare';
        $description = "{$user->name} ({$user->email}) a solicitat înregistrarea.";
        $actionUrl = "/admin/users/{$user->id}";

        foreach ($admins as $admin) {
            Notification::create([
                'user_id' => $admin->id,
                'type' => 'registration_requested',
                'title' => $title,
                'description' => $description,
                'data' => ['user_id' => $user->id],
                'action_url' => $actionUrl,
                'severity' => 'warning',
            ]);
        }

        $this->emailNotificationService->sendToMany(
            $admins,
            $title,
            $description,
            $actionUrl,
            'Revizuiește cererea'
        );
    }

    /**
     * @return array<int>
     */
    private function getTargetStudentIds(Course $course, array $teamIds, bool $broadcastAllStudentsIfNoTargets): array
    {
        $ids = [];

        if (count($teamIds) > 0 && SchemaCache::hasTable('team_user')) {
            $ids = array_merge($ids, DB::table('team_user')
                ->whereIn('team_id', $teamIds)
                ->join('users', 'team_user.user_id', '=', 'users.id')
                ->where('users.role', 'student')
                ->distinct()
                ->pluck('team_user.user_id')
                ->all());
        }

        if (SchemaCache::hasTable('course_user')) {
            $enrolled = DB::table('course_user')
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->join('users', 'course_user.user_id', '=', 'users.id')
                ->where('users.role', 'student')
                ->pluck('course_user.user_id')
                ->all();
            $ids = array_merge($ids, $enrolled);
        }

        if (SchemaCache::hasTable('course_team') && SchemaCache::hasTable('team_user')) {
            $courseTeamIds = DB::table('course_team')
                ->where('course_id', $course->id)
                ->pluck('team_id')
                ->all();

            if ($courseTeamIds !== []) {
                $fromCourseTeams = DB::table('team_user')
                    ->whereIn('team_id', $courseTeamIds)
                    ->join('users', 'team_user.user_id', '=', 'users.id')
                    ->where('users.role', 'student')
                    ->distinct()
                    ->pluck('team_user.user_id')
                    ->all();
                $ids = array_merge($ids, $fromCourseTeams);
            }
        }

        $ids = array_values(array_unique(array_map('intval', $ids)));

        if ($ids !== []) {
            return $ids;
        }

        if ($broadcastAllStudentsIfNoTargets) {
            return User::where('role', 'student')->pluck('id')->all();
        }

        return [];
    }

    private function hasRecentCoursePublishedNotification(int $userId, int $courseId): bool
    {
        return $this->hasRecentNotification($userId, 'course_published', ['course_id' => $courseId], days: 7);
    }

    private function hasRecentNotification(int $userId, string $type, array $dataMatch, int $days = 1): bool
    {
        $query = Notification::where('user_id', $userId)
            ->where('type', $type)
            ->where('created_at', '>=', now()->subDays($days));

        foreach ($dataMatch as $key => $value) {
            $query->where('data->' . $key, $value);
        }

        return $query->exists();
    }
}
