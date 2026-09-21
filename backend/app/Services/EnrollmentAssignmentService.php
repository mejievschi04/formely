<?php

namespace App\Services;

use App\Models\Course;
use App\Models\EnrollmentAssignment;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;

class EnrollmentAssignmentService
{
    public function __construct(
        protected CourseEnrollmentService $courseEnrollmentService
    ) {}

    /**
     * @param  array<int>  $userIds
     * @param  array{
     *     is_mandatory?: bool,
     *     due_at?: \DateTimeInterface|string|null,
     *     assigned_by?: User|null,
     *     source_type?: string,
     *     source_team_id?: int|null,
     *     source_department_id?: int|null,
     *     source_role?: string|null,
     *     metadata?: array|null,
     *     allowed_team_ids?: array<int>|null
     * }  $options
     * @return array{assigned: array<int>, skipped: array<int, string>, errors: array<int, string>}
     */
    public function assignCourseToUsers(Course $course, array $userIds, array $options = []): array
    {
        $isMandatory = (bool) ($options['is_mandatory'] ?? true);
        $this->assertMandatoryCourseHasRequiredTests($course, $isMandatory);

        $result = ['assigned' => [], 'skipped' => [], 'errors' => []];

        foreach (array_values(array_unique(array_map('intval', $userIds))) as $userId) {
            $user = User::find($userId);
            if (! $user) {
                $result['errors'][$userId] = 'Utilizator negăsit.';
                continue;
            }

            try {
                $this->assertUserCanReceiveAssignment($user, $options['allowed_team_ids'] ?? null);
            } catch (InvalidArgumentException $e) {
                $result['errors'][$userId] = $e->getMessage();
                continue;
            }

            $pivot = [
                'is_mandatory' => $isMandatory,
                'assigned_at' => now(),
            ];

            $newlyEnrolled = $this->courseEnrollmentService->enroll($user, $course, $pivot);
            $this->recordAssignment(
                EnrollmentAssignment::TYPE_COURSE,
                $user,
                $options,
                courseId: $course->id,
                learningPathId: null
            );

            $this->clearUserCaches($user);
            $result['assigned'][$userId] = $newlyEnrolled ? 'enrolled' : 'reactivated';
        }

        return $result;
    }


    /**
     * @param  array<string, mixed>  $options
     * @return array{assigned: array<int>, skipped: array<int, string>, errors: array<int, string>}
     */
    public function assignCourseToTeam(Course $course, Team $team, array $options = []): array
    {
        $options['source_type'] = EnrollmentAssignment::SOURCE_TEAM;
        $options['source_team_id'] = $team->id;

        $userIds = $this->resolveTeamMemberIds($team);

        return $this->assignCourseToUsers($course, $userIds, $options);
    }


    /**
     * @param  array<string, mixed>  $options
     * @return array{assigned: array<int, array<int, string>>, skipped: array<int, array<int, string>>, errors: array<int, array<int, string>>}
     */
    public function autoEnrollUserForTeam(Team $team, User $user, array $options = []): array
    {
        $options = array_merge([
            'source_type' => EnrollmentAssignment::SOURCE_TEAM,
            'source_team_id' => $team->id,
            'is_mandatory' => false,
            'metadata' => ['auto_enroll' => true],
        ], $options);

        $summary = ['assigned' => [], 'skipped' => [], 'errors' => []];

        if ($user->role !== 'student' || $user->isLearningActivityExempt()) {
            $summary['skipped'][$user->id][0] = 'user_not_eligible';

            return $summary;
        }

        foreach ($team->courses()->get() as $course) {
            if ($this->userIsEnrolledInCourse($user, $course)) {
                $summary['skipped'][$user->id][$course->id] = 'already_enrolled';
                continue;
            }

            try {
                $result = $this->assignCourseToUsers($course, [$user->id], $options);
                if (isset($result['assigned'][$user->id])) {
                    $summary['assigned'][$user->id][$course->id] = $result['assigned'][$user->id];
                }
                if (isset($result['errors'][$user->id])) {
                    $summary['errors'][$user->id][$course->id] = $result['errors'][$user->id];
                }
            } catch (InvalidArgumentException $e) {
                $summary['errors'][$user->id][$course->id] = $e->getMessage();
            }
        }

        return $summary;
    }

    /**
     * @param  array<int>  $courseIds
     * @param  array<string, mixed>  $options
     * @return array{assigned: array<int, array<int, string>>, skipped: array<int, array<int, string>>, errors: array<int, array<int, string>>}
     */
    public function autoEnrollTeamForCourses(Team $team, array $courseIds, array $options = []): array
    {
        $summary = ['assigned' => [], 'skipped' => [], 'errors' => []];
        $courseIds = array_values(array_unique(array_map('intval', $courseIds)));

        foreach ($this->resolveTeamMemberIds($team) as $userId) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }

            foreach ($courseIds as $courseId) {
                $course = Course::find($courseId);
                if (! $course) {
                    continue;
                }

                if ($this->userIsEnrolledInCourse($user, $course)) {
                    $summary['skipped'][$userId][$courseId] = 'already_enrolled';
                    continue;
                }

                try {
                    $result = $this->assignCourseToUsers($course, [$userId], array_merge([
                        'source_type' => EnrollmentAssignment::SOURCE_TEAM,
                        'source_team_id' => $team->id,
                        'is_mandatory' => false,
                        'metadata' => ['auto_enroll' => true],
                    ], $options));

                    if (isset($result['assigned'][$userId])) {
                        $summary['assigned'][$userId][$courseId] = $result['assigned'][$userId];
                    }
                    if (isset($result['errors'][$userId])) {
                        $summary['errors'][$userId][$courseId] = $result['errors'][$userId];
                    }
                } catch (InvalidArgumentException $e) {
                    $summary['errors'][$userId][$courseId] = $e->getMessage();
                }
            }
        }

        return $summary;
    }

    /**
     * @param  array<int>  $teamIds
     * @param  array<string, mixed>  $options
     * @return array{assigned: array<int, array<int, string>>, skipped: array<int, array<int, string>>, errors: array<int, array<int, string>>}
     */
    public function autoEnrollCourseForTeams(Course $course, array $teamIds, array $options = []): array
    {
        $summary = ['assigned' => [], 'skipped' => [], 'errors' => []];
        $teamIds = array_values(array_unique(array_map('intval', $teamIds)));

        foreach ($teamIds as $teamId) {
            $team = Team::find($teamId);
            if (! $team) {
                continue;
            }

            foreach ($this->resolveTeamMemberIds($team) as $userId) {
                $user = User::find($userId);
                if (! $user) {
                    continue;
                }

                if ($this->userIsEnrolledInCourse($user, $course)) {
                    $summary['skipped'][$userId][$course->id] = 'already_enrolled';
                    continue;
                }

                try {
                    $result = $this->assignCourseToUsers($course, [$userId], array_merge([
                        'source_type' => EnrollmentAssignment::SOURCE_TEAM,
                        'source_team_id' => $team->id,
                        'is_mandatory' => false,
                        'metadata' => ['auto_enroll' => true],
                    ], $options));

                    if (isset($result['assigned'][$userId])) {
                        $summary['assigned'][$userId][$course->id] = $result['assigned'][$userId];
                    }
                    if (isset($result['errors'][$userId])) {
                        $summary['errors'][$userId][$course->id] = $result['errors'][$userId];
                    }
                } catch (InvalidArgumentException $e) {
                    $summary['errors'][$userId][$course->id] = $e->getMessage();
                }
            }
        }

        return $summary;
    }

    /**
     * @param  array<int>  $userIds
     * @param  array<string, mixed>  $options
     * @return array{assigned: array<int, array<int, string>>, skipped: array<int, array<int, string>>, errors: array<int, array<int, string>>}
     */
    public function autoEnrollUsersForTeam(Team $team, array $userIds, array $options = []): array
    {
        $summary = ['assigned' => [], 'skipped' => [], 'errors' => []];

        foreach (array_values(array_unique(array_map('intval', $userIds))) as $userId) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }

            $result = $this->autoEnrollUserForTeam($team, $user, $options);
            $summary['assigned'] = array_replace_recursive($summary['assigned'], $result['assigned']);
            $summary['skipped'] = array_replace_recursive($summary['skipped'], $result['skipped']);
            $summary['errors'] = array_replace_recursive($summary['errors'], $result['errors']);
        }

        return $summary;
    }


    protected function userIsEnrolledInCourse(User $user, Course $course): bool
    {
        if (! Schema::hasTable('course_user')) {
            return false;
        }

        return DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->exists();
    }

    /**
     * @return array<int>
     */
    public function resolveTeamMemberIds(Team $team): array
    {
        return $team->users()
            ->where('role', 'student')
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @param  array<int>|null  $allowedTeamIds
     */
    public function assertUserCanReceiveAssignment(User $user, ?array $allowedTeamIds = null): void
    {
        if ($user->role !== 'student') {
            throw new InvalidArgumentException('Poți atribui doar utilizatorilor cu rolul de elev (student).');
        }

        if ($user->isLearningActivityExempt()) {
            throw new InvalidArgumentException('Nu atribuim conținut pentru acest tip de utilizator.');
        }

        if ($allowedTeamIds !== null && $allowedTeamIds !== []) {
            $inLinkedTeam = $user->teams()->whereIn('teams.id', $allowedTeamIds)->exists();
            if (! $inLinkedTeam) {
                throw new InvalidArgumentException('Elevul trebuie să fie într-o echipă eligibilă pentru această atribuire.');
            }
        }
    }

    public function assertMandatoryCourseHasRequiredTests(Course $course, bool $isMandatory): void
    {
        // Completarea cursului cere toate testele publicate la ≥80%. Atribuirea nu mai depinde de flag-ul `required`.
    }

    /**
     * @param  array<string, mixed>  $options
     */
    protected function recordAssignment(
        string $assignableType,
        User $user,
        array $options,
        ?int $courseId,
        ?int $learningPathId
    ): EnrollmentAssignment {
        if (! Schema::hasTable('enrollment_assignments')) {
            throw new \RuntimeException('enrollment_assignments table is missing.');
        }

        /** @var User|null $assignedBy */
        $assignedBy = $options['assigned_by'] ?? auth()->user();
        $sourceType = $options['source_type'] ?? EnrollmentAssignment::SOURCE_MANUAL;

        $existing = EnrollmentAssignment::query()
            ->where('assignable_type', $assignableType)
            ->where('user_id', $user->id)
            ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
            ->where('source_type', $sourceType)
            ->when($courseId, fn ($q) => $q->where('course_id', $courseId), fn ($q) => $q->whereNull('course_id'))
            ->when($learningPathId, fn ($q) => $q->where('learning_path_id', $learningPathId), fn ($q) => $q->whereNull('learning_path_id'))
            ->first();
        if ($existing) {
            return $existing;
        }

        return EnrollmentAssignment::create([
            'assignable_type' => $assignableType,
            'course_id' => $courseId,
            'learning_path_id' => $learningPathId,
            'source_type' => $sourceType,
            'source_team_id' => $options['source_team_id'] ?? null,
            'source_department_id' => $options['source_department_id'] ?? null,
            'source_role' => $options['source_role'] ?? null,
            'user_id' => $user->id,
            'is_mandatory' => (bool) ($options['is_mandatory'] ?? true),
            'due_at' => $options['due_at'] ?? null,
            'assigned_by' => $assignedBy?->id,
            'assigned_at' => now(),
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
            'metadata' => $options['metadata'] ?? null,
        ]);
    }

    protected function clearUserCaches(User $user): void
    {
        Cache::forget("dashboard_user_{$user->id}_stats");
        Cache::forget("profile_user_{$user->id}");
    }

    /**
     * @param  array<int>  $removedTeamIds
     * @param  array<int>  $remainingTeamIds
     */
    public function revokeCourseAccessForRemovedTeams(Course $course, array $removedTeamIds, array $remainingTeamIds): void
    {
        $removedTeamIds = array_values(array_unique(array_map('intval', $removedTeamIds)));
        $remainingTeamIds = array_values(array_unique(array_map('intval', $remainingTeamIds)));
        if ($removedTeamIds === []) {
            return;
        }

        $userIds = User::query()
            ->where('role', 'student')
            ->whereHas('teams', fn ($q) => $q->whereIn('teams.id', $removedTeamIds))
            ->pluck('id');

        foreach ($userIds as $userId) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }
            $this->revokeTeamSourcedCourseIfOrphaned($user, $course, $remainingTeamIds);
        }
    }

    /**
     * @param  array<int>  $removedUserIds
     */
    public function revokeTeamCoursesForRemovedUsers(Team $team, array $removedUserIds): void
    {
        $remainingTeamCourses = $team->courses()->get();
        foreach (array_values(array_unique(array_map('intval', $removedUserIds))) as $userId) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }
            foreach ($remainingTeamCourses as $course) {
                $remainingTeamIds = $course->teams()->pluck('teams.id')->map(fn ($id) => (int) $id)->all();
                $this->revokeTeamSourcedCourseIfOrphaned($user, $course, $remainingTeamIds);
            }
        }
    }

    /**
     * @param  array<int>  $removedCourseIds
     */
    public function revokeRemovedCoursesFromTeam(Team $team, array $removedCourseIds): void
    {
        foreach (array_values(array_unique(array_map('intval', $removedCourseIds))) as $courseId) {
            $course = Course::find($courseId);
            if (! $course) {
                continue;
            }
            $remainingTeamIds = $course->teams()->pluck('teams.id')->map(fn ($id) => (int) $id)->all();
            foreach ($this->resolveTeamMemberIds($team) as $userId) {
                $user = User::find($userId);
                if (! $user) {
                    continue;
                }
                $this->revokeTeamSourcedCourseIfOrphaned($user, $course, $remainingTeamIds);
            }
        }
    }

    /**
     * @param  array<int>  $remainingLinkedTeamIds
     */
    protected function revokeTeamSourcedCourseIfOrphaned(User $user, Course $course, array $remainingLinkedTeamIds): void
    {
        if ($this->hasActiveManualCourseAssignment($user, $course)) {
            return;
        }
        if ($remainingLinkedTeamIds !== [] && $user->teams()->whereIn('teams.id', $remainingLinkedTeamIds)->exists()) {
            return;
        }

        if (Schema::hasTable('course_user')) {
            $user->assignedCourses()->detach($course->id);
        }

        if (Schema::hasTable('enrollment_assignments')) {
            EnrollmentAssignment::query()
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
                ->where('source_type', EnrollmentAssignment::SOURCE_TEAM)
                ->update(['status' => EnrollmentAssignment::STATUS_REVOKED]);
        }

        $this->clearUserCaches($user);
    }

    /**
     * @param  array<int>  $desiredCourseIds
     * @param  array<string, mixed>  $options
     */
    public function syncManualCourseAssignments(User $user, array $desiredCourseIds, array $options = []): void
    {
        $desiredIds = array_values(array_unique(array_map('intval', $desiredCourseIds)));
        $currentManualIds = [];
        if (Schema::hasTable('enrollment_assignments')) {
            $currentManualIds = EnrollmentAssignment::query()
                ->where('user_id', $user->id)
                ->where('assignable_type', EnrollmentAssignment::TYPE_COURSE)
                ->where('source_type', EnrollmentAssignment::SOURCE_MANUAL)
                ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
                ->pluck('course_id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        foreach ($desiredIds as $courseId) {
            $course = Course::find($courseId);
            if (! $course) {
                continue;
            }
            $this->assignCourseToUsers($course, [$user->id], array_merge($options, [
                'source_type' => EnrollmentAssignment::SOURCE_MANUAL,
            ]));
        }

        foreach (array_values(array_diff($currentManualIds, $desiredIds)) as $removeId) {
            $course = Course::find($removeId);
            if ($course) {
                $this->revokeManualCourseAssignment($user, $course);
            }
        }
    }

    public function revokeManualCourseAssignment(User $user, Course $course): void
    {
        if (Schema::hasTable('enrollment_assignments')) {
            EnrollmentAssignment::query()
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
                ->where('source_type', EnrollmentAssignment::SOURCE_MANUAL)
                ->update(['status' => EnrollmentAssignment::STATUS_REVOKED]);
        }

        $remainingTeamIds = $course->teams()->pluck('teams.id')->map(fn ($id) => (int) $id)->all();
        if ($remainingTeamIds !== [] && $user->teams()->whereIn('teams.id', $remainingTeamIds)->exists()) {
            $this->clearUserCaches($user);

            return;
        }

        if (Schema::hasTable('course_user')) {
            $user->assignedCourses()->detach($course->id);
        }
        if (Schema::hasTable('enrollment_assignments')) {
            EnrollmentAssignment::query()
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
                ->update(['status' => EnrollmentAssignment::STATUS_REVOKED]);
        }
        $this->clearUserCaches($user);
    }

    public function dissolveTeam(Team $team): void
    {
        $courseIds = $team->courses()->pluck('courses.id')->map(fn ($id) => (int) $id)->all();
        $team->courses()->sync([]);
        $this->revokeRemovedCoursesFromTeam($team, $courseIds);
        $team->users()->sync([]);
    }

    public function constrainToManualAssignedUsers($query, Course $course): void
    {
        if (Schema::hasTable('course_user') && Schema::hasColumn('course_user', 'enrolled')) {
            $query->wherePivot('enrolled', true);
        }
        if (! Schema::hasTable('enrollment_assignments')) {
            return;
        }

        $query->whereHas('enrollmentAssignments', function ($q) use ($course) {
            $q->where('course_id', $course->id)
                ->where('assignable_type', EnrollmentAssignment::TYPE_COURSE)
                ->where('source_type', EnrollmentAssignment::SOURCE_MANUAL)
                ->where('status', EnrollmentAssignment::STATUS_ACTIVE);
        });
    }

    protected function hasActiveManualCourseAssignment(User $user, Course $course): bool
    {
        if (! Schema::hasTable('enrollment_assignments')) {
            return false;
        }

        return EnrollmentAssignment::query()
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('status', EnrollmentAssignment::STATUS_ACTIVE)
            ->where('source_type', EnrollmentAssignment::SOURCE_MANUAL)
            ->exists();
    }
}
