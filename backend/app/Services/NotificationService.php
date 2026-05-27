<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Course;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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
        if (! Schema::hasTable('notifications')) {
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
     * Notify a student they enrolled in a course.
     */
    public function notifyCourseEnrolled(User $student, Course $course): void
    {
        if (! Schema::hasTable('notifications') || $student->isLearningActivityExempt()) {
            return;
        }

        if ($this->hasRecentNotification($student->id, 'course_enrolled', ['course_id' => $course->id])) {
            return;
        }

        $title = 'Înscriere confirmată';
        $description = 'Te-ai înscris la cursul "' . $course->title . '".';
        $actionUrl = '/courses/' . $course->id;

        Notification::create([
            'user_id' => $student->id,
            'type' => 'course_enrolled',
            'title' => $title,
            'description' => $description,
            'data' => ['course_id' => $course->id],
            'action_url' => $actionUrl,
            'severity' => 'success',
        ]);

        $this->emailNotificationService->sendToUser($student, $title, $description, $actionUrl, 'Continuă cursul');
    }

    /**
     * Notify conversation participants about a new message (except sender).
     */
    public function notifyNewMessage(User $sender, Conversation $conversation, string $preview): void
    {
        if (! Schema::hasTable('notifications')) {
            return;
        }

        $recipientIds = $conversation->participants()
            ->where('users.id', '!=', $sender->id)
            ->pluck('users.id')
            ->all();

        $title = $conversation->name
            ? 'Mesaj nou în ' . $conversation->name
            : 'Mesaj nou de la ' . $sender->name;

        $previewText = mb_strlen($preview) > 120 ? mb_substr($preview, 0, 117) . '...' : $preview;
        $actionUrl = '/messages?conversation=' . $conversation->id;
        $emailRecipientIds = [];

        foreach ($recipientIds as $recipientId) {
            try {
                Notification::create([
                    'user_id' => $recipientId,
                    'type' => 'new_message',
                    'title' => $title,
                    'description' => $previewText,
                    'data' => [
                        'conversation_id' => $conversation->id,
                        'sender_id' => $sender->id,
                    ],
                    'action_url' => $actionUrl,
                    'severity' => 'info',
                ]);
                $emailRecipientIds[] = (int) $recipientId;
            } catch (\Throwable $e) {
                \Log::warning('NotificationService::notifyNewMessage failed', [
                    'recipient_id' => $recipientId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if ($emailRecipientIds !== []) {
            $this->emailNotificationService->sendToMany(
                User::whereIn('id', $emailRecipientIds)->get(),
                $title,
                $previewText,
                $actionUrl,
                'Citește mesajul'
            );
        }
    }

    /**
     * Notify staff when a student completes a course.
     */
    public function notifyCourseCompleted(User $student, Course $course): void
    {
        if (! Schema::hasTable('notifications')) {
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
        if (! Schema::hasTable('notifications')) {
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

        if (count($teamIds) > 0 && Schema::hasTable('team_user')) {
            $ids = array_merge($ids, DB::table('team_user')
                ->whereIn('team_id', $teamIds)
                ->join('users', 'team_user.user_id', '=', 'users.id')
                ->where('users.role', 'student')
                ->distinct()
                ->pluck('team_user.user_id')
                ->all());
        }

        if (Schema::hasTable('course_user')) {
            $enrolled = DB::table('course_user')
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->join('users', 'course_user.user_id', '=', 'users.id')
                ->where('users.role', 'student')
                ->pluck('course_user.user_id')
                ->all();
            $ids = array_merge($ids, $enrolled);
        }

        if (Schema::hasTable('course_team') && Schema::hasTable('team_user')) {
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
