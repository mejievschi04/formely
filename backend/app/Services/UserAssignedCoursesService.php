<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\Team;
use App\Models\TestResult;
use App\Models\User;
use App\Models\UserTestAttemptGrant;
use App\Services\TestAttemptService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Support\SchemaCache;

class UserAssignedCoursesService
{
    public const SOURCE_TEAM = 'team';

    public const SOURCE_DIRECT = 'direct';

    /**
     * @return array{
     *     course_stats: array{total_assigned: int, completed: int, in_progress: int, not_accessed: int},
     *     courses_assigned: array<int, array<string, mixed>>,
     *     courses_in_progress: array<int, array<string, mixed>>,
     *     courses_completed: array<int, array<string, mixed>>,
     *     courses_not_accessed: array<int, array<string, mixed>>,
     *     completed_quizzes: int,
     *     completed_modules: int,
     *     completion_percentage: int,
     *     in_progress_courses: int,
     *     completed_courses: int,
     *     total_courses: int
     * }
     */
    public function buildProfileCoursesData(User $user): array
    {
        if (! $user->relationLoaded('assignedCourses')) {
            $user->load([
                'assignedCourses.modules:id,course_id,title,order',
                'assignedCourses.teacher:id,name',
                'assignedCourses.tests:id,title,max_attempts,passing_score,status,created_by',
            ]);
        } elseif ($user->assignedCourses->isNotEmpty() && ! $user->assignedCourses->first()->relationLoaded('tests')) {
            $user->assignedCourses->load(['tests:id,title,max_attempts,passing_score,status,created_by']);
        }

        $courses = $user->assignedCourses;
        $courseIds = $courses->pluck('id')->toArray();

        $courseProgress = DB::table('course_user')
            ->where('user_id', $user->id)
            ->when(! empty($courseIds), fn ($q) => $q->whereIn('course_id', $courseIds))
            ->get()
            ->keyBy('course_id');

        $exams = [];
        $examIds = [];
        if (! empty($courseIds)) {
            try {
                $exams = Exam::whereIn('course_id', $courseIds)->get();
                $examIds = $exams->pluck('id')->toArray();
            } catch (\Exception $e) {
                Log::warning('Error fetching exams for user profile', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        }

        $latestExamResults = collect();
        if (! empty($examIds)) {
            try {
                $latestExamResults = ExamResult::whereIn('exam_id', $examIds)
                    ->where('user_id', $user->id)
                    ->orderBy('exam_id')
                    ->orderBy('attempt_number', 'desc')
                    ->get()
                    ->unique('exam_id')
                    ->keyBy('exam_id');
            } catch (\Exception $e) {
                Log::warning('Error fetching exam results for user profile', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        }

        $courseExamMap = [];
        foreach ($exams as $exam) {
            $latestResult = $latestExamResults->get($exam->id);
            if ($latestResult && isset($latestResult->passed) && $latestResult->passed === true) {
                $courseExamMap[$exam->course_id] = true;
            }
        }

        $passedExamResults = $latestExamResults->filter(fn ($result) => isset($result->passed) && $result->passed === true);

        $testIds = $courses->flatMap(fn ($course) => $course->relationLoaded('tests') ? $course->tests->pluck('id') : collect())->unique()->values();
        $latestTestResults = collect();
        $extraAttemptsByTest = collect();
        if ($testIds->isNotEmpty()) {
            $latestTestResults = TestResult::query()
                ->where('user_id', $user->id)
                ->whereIn('test_id', $testIds)
                ->where('status', '!=', 'in_progress')
                ->orderByDesc('attempt_number')
                ->orderByDesc('id')
                ->get()
                ->groupBy(fn ($row) => (int) $row->test_id);
            if (SchemaCache::hasTable('user_test_attempt_grants')) {
                $extraAttemptsByTest = UserTestAttemptGrant::query()
                    ->where('user_id', $user->id)
                    ->whereIn('test_id', $testIds)
                    ->get()
                    ->keyBy('test_id');
            }
        }
        $attemptService = app(TestAttemptService::class);

        $totalModules = $courses->sum(fn ($course) => $course->modules ? $course->modules->count() : 0);
        $completedModules = $courses->sum(function ($course) use ($courseProgress) {
            $progress = $courseProgress->get($course->id);
            $moduleCount = $course->modules ? $course->modules->count() : 0;

            return ($progress && ! empty($progress->completed_at)) ? $moduleCount : 0;
        });
        $completedQuizzes = $passedExamResults->count();
        $progressPercentage = $totalModules > 0 ? round(($completedModules / $totalModules) * 100) : 0;

        $coursesInProgress = [];
        $coursesCompleted = [];
        $coursesNotAccessed = [];
        $coursesAssigned = [];

        foreach ($courses as $course) {
            $progress = $courseProgress->get($course->id);
            $courseProgressPercentage = $progress && isset($progress->progress_percentage)
                ? (float) ($progress->progress_percentage ?? 0)
                : 0;
            $isCompleted = $progress && (
                ! empty($progress->completed_at)
                || (float) ($progress->progress_percentage ?? 0) >= 100
            );
            $hasStarted = $progress && (
                $courseProgressPercentage > 0
                || ! empty($progress->started_at)
            );
            $quizPassed = isset($courseExamMap[$course->id]) && $courseExamMap[$course->id] === true;
            $moduleCount = $course->modules ? $course->modules->count() : 0;
            $assignedAt = $course->pivot->assigned_at ?? null;

            $courseTests = [];
            foreach ($course->tests ?? [] as $test) {
                $resultsForTest = $latestTestResults->get((int) $test->id) ?? collect();
                $latestTestResult = $resultsForTest->first();
                $attemptsUsed = $resultsForTest->count();
                $passed = (bool) ($latestTestResult?->passed);
                $percentage = $latestTestResult?->percentage !== null ? (float) $latestTestResult->percentage : null;
                $extraAttempts = (int) ($extraAttemptsByTest->get($test->id)?->extra_attempts ?? 0);
                $remaining = $attemptService->remainingAttemptsFor($test, (int) $user->id, $attemptsUsed);
                if ($passed) {
                    $quizPassed = true;
                }
                $courseTests[] = [
                    'id' => (int) $test->id,
                    'title' => $test->title ?? 'Test',
                    'max_attempts' => $test->max_attempts,
                    'created_by' => $test->created_by !== null ? (int) $test->created_by : null,
                    'extra_attempts' => $extraAttempts,
                    'attempts_used' => $attemptsUsed,
                    'remaining_attempts' => $remaining,
                    'passed' => $passed,
                    'percentage' => $percentage,
                    'status' => ! $latestTestResult
                        ? 'not_started'
                        : ($passed ? 'passed' : ((string) ($latestTestResult->status ?? '') === 'pending_review' || $latestTestResult->needs_manual_review ? 'pending' : 'failed')),
                ];
            }

            $coursePayload = [
                'id' => $course->id,
                'title' => $course->title ?? '',
                'description' => $course->description ?? '',
                'short_description' => $course->short_description ?? '',
                'image_url' => $course->image_url ?? $course->image ?? null,
                'progress' => round($courseProgressPercentage, 1),
                'progress_percentage' => round($courseProgressPercentage, 1),
                'completedModules' => $isCompleted
                    ? $moduleCount
                    : round(($courseProgressPercentage / 100) * $moduleCount),
                'totalModules' => $moduleCount,
                'quizPassed' => $quizPassed,
                'tests' => $courseTests,
                'assigned_at' => $assignedAt,
                'teacher_name' => $course->teacher?->name,
            ];

            if ($isCompleted) {
                $coursePayload['status'] = 'completed';
                $coursesCompleted[] = $coursePayload;
            } elseif ($hasStarted) {
                $coursePayload['status'] = 'in_progress';
                $coursesInProgress[] = $coursePayload;
            } else {
                $coursePayload['status'] = 'not_accessed';
                $coursesNotAccessed[] = $coursePayload;
            }

            $coursesAssigned[] = $coursePayload;
        }

        $courseStats = [
            'total_assigned' => count($coursesAssigned),
            'completed' => count($coursesCompleted),
            'in_progress' => count($coursesInProgress),
            'not_accessed' => count($coursesNotAccessed),
        ];

        return [
            'course_stats' => $courseStats,
            'courses_assigned' => $coursesAssigned,
            'courses_in_progress' => $coursesInProgress,
            'courses_completed' => $coursesCompleted,
            'courses_not_accessed' => $coursesNotAccessed,
            'completed_quizzes' => $completedQuizzes,
            'completed_modules' => $completedModules,
            'completion_percentage' => $progressPercentage,
            'in_progress_courses' => count($coursesInProgress),
            'completed_courses' => count($coursesCompleted),
            'total_courses' => count($coursesAssigned),
        ];
    }

    /**
     * Indicate a course to students without removing their other assignments.
     *
     * @param  iterable<int>  $userIds
     */
    public function enrollStudentsInCourse(Course $course, iterable $userIds, string $source = self::SOURCE_TEAM): void
    {
        $pivot = $this->enrollmentPivot($source);

        foreach ($userIds as $userId) {
            $user = User::find($userId);
            if (! $user || $user->role !== 'student' || $user->isLearningActivityExempt()) {
                continue;
            }
            $existing = $user->assignedCourses()->where('courses.id', $course->id)->first();
            if ($existing) {
                if (
                    $this->hasAssignmentSourceColumn()
                    && $source === self::SOURCE_TEAM
                    && (string) ($existing->pivot->assignment_source ?? '') === ''
                ) {
                    $user->assignedCourses()->updateExistingPivot($course->id, [
                        'assignment_source' => self::SOURCE_TEAM,
                    ]);
                }
                continue;
            }
            $user->assignedCourses()->attach($course->id, $pivot);
            app(NotificationService::class)->notifyCourseEnrolled($user, $course);
            $this->forgetUserCourseCaches($user);
        }
    }

    /**
     * Atribuire directă (o persoană): nu șterge celelalte cursuri; promovează o înscriere din echipă la directă.
     */
    public function assignCourseDirectly(User $user, Course $course, array $pivot): void
    {
        if ($user->role !== 'student' || $user->isLearningActivityExempt()) {
            return;
        }

        $existing = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first();

        $payload = array_merge($this->enrollmentPivot(self::SOURCE_DIRECT), $pivot, [
            'assignment_source' => self::SOURCE_DIRECT,
        ]);
        if (! $this->hasAssignmentSourceColumn()) {
            unset($payload['assignment_source']);
        }
        if ($existing) {
            unset($payload['assigned_at'], $payload['enrolled_at'], $payload['created_at']);
            foreach (['progress_percentage', 'completed_at', 'started_at', 'manually_completed'] as $keep) {
                unset($payload[$keep]);
            }
            DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->update(array_merge($payload, ['updated_at' => now(), 'enrolled' => true]));
        } else {
            $user->assignedCourses()->attach($course->id, $payload);
        }
        $this->forgetUserCourseCaches($user);
    }

    /**
     * Sincronizează doar atribuirile directe. Cursurile primite prin echipă rămân.
     *
     * @param  array<int>  $desiredCourseIds
     */
    public function syncDirectAssignments(User $user, array $desiredCourseIds, array $pivot): void
    {
        $desiredIds = $this->intIds($desiredCourseIds);
        $user->loadMissing('assignedCourses');
        $currentDirectIds = [];
        foreach ($user->assignedCourses as $course) {
            if ($this->isDirectAssignment($user, $course, $course->pivot)) {
                $currentDirectIds[] = (int) $course->id;
            }
        }

        foreach ($desiredIds as $courseId) {
            $course = Course::find($courseId);
            if ($course) {
                $this->assignCourseDirectly($user, $course, $pivot);
            }
        }

        foreach (array_values(array_diff($currentDirectIds, $desiredIds)) as $removeId) {
            $course = Course::find($removeId);
            if ($course) {
                $this->revokeDirectAssignment($user, $course);
            }
        }
    }

    public function revokeDirectAssignment(User $user, Course $course): void
    {
        if ($user->role !== 'student') {
            $user->assignedCourses()->detach($course->id);
            $this->forgetUserCourseCaches($user);

            return;
        }

        if ($this->userKeepsCourseViaTeam($user, $course)) {
            if ($this->hasAssignmentSourceColumn()) {
                $user->assignedCourses()->updateExistingPivot($course->id, [
                    'assignment_source' => self::SOURCE_TEAM,
                    'updated_at' => now(),
                ]);
            }
            $this->forgetUserCourseCaches($user);

            return;
        }

        $user->assignedCourses()->detach($course->id);
        $this->forgetUserCourseCaches($user);
    }

    /**
     * @param  array<int>  $teamIds
     */
    public function syncCourseTeams(Course $course, array $teamIds): void
    {
        $previousTeamIds = $this->intIds($course->teams()->pluck('teams.id'));
        $nextTeamIds = $this->intIds($teamIds);
        $course->teams()->sync($nextTeamIds);

        if ($nextTeamIds !== []) {
            $memberIds = User::query()
                ->where('role', 'student')
                ->whereHas('teams', fn ($q) => $q->whereIn('teams.id', $nextTeamIds))
                ->pluck('id');
            $this->enrollStudentsInCourse($course, $memberIds, self::SOURCE_TEAM);
        }

        $removedTeamIds = array_values(array_diff($previousTeamIds, $nextTeamIds));
        if ($removedTeamIds !== []) {
            $this->revokeTeamOnlyEnrollmentsForCourse($course, $removedTeamIds, $nextTeamIds);
        }
    }

    /**
     * @param  array<int>  $courseIds
     */
    public function syncTeamCourses(Team $team, array $courseIds): void
    {
        $previousCourseIds = $this->intIds($team->courses()->pluck('courses.id'));
        $nextCourseIds = $this->intIds($courseIds);
        $team->courses()->sync($nextCourseIds);

        $memberIds = $team->users()->where('users.role', 'student')->pluck('users.id');
        foreach (Course::whereIn('id', $nextCourseIds)->get() as $course) {
            $this->enrollStudentsInCourse($course, $memberIds, self::SOURCE_TEAM);
        }

        $removedCourseIds = array_values(array_diff($previousCourseIds, $nextCourseIds));
        foreach ($removedCourseIds as $courseId) {
            $course = Course::find($courseId);
            if (! $course) {
                continue;
            }
            $remainingTeamIds = $this->intIds($course->teams()->pluck('teams.id'));
            $this->revokeTeamOnlyEnrollmentsForCourse($course, [$team->id], $remainingTeamIds);
        }
    }

    /**
     * @param  array<int>  $userIds
     */
    public function syncTeamUsers(Team $team, array $userIds): void
    {
        $previousUserIds = $this->intIds($team->users()->pluck('users.id'));
        $nextUserIds = $this->intIds($userIds);
        $team->users()->sync($nextUserIds);

        $addedUserIds = array_values(array_diff($nextUserIds, $previousUserIds));
        $removedUserIds = array_values(array_diff($previousUserIds, $nextUserIds));

        foreach ($team->courses()->get() as $course) {
            $this->enrollStudentsInCourse($course, $addedUserIds, self::SOURCE_TEAM);
        }

        foreach ($removedUserIds as $userId) {
            $this->revokeTeamOnlyEnrollmentsForUser(User::find($userId), $team);
        }
    }

    public function dissolveTeam(Team $team): void
    {
        $this->syncTeamUsers($team, []);
        $this->syncTeamCourses($team, []);
    }

    public function enrollUserInLinkedTeamCourses(User $user): void
    {
        if ($user->role !== 'student' || $user->isLearningActivityExempt()) {
            return;
        }

        $user->loadMissing('teams.courses');
        foreach ($user->teams as $team) {
            foreach ($team->courses as $course) {
                $this->enrollStudentsInCourse($course, [$user->id], self::SOURCE_TEAM);
            }
        }
    }

    public function revokeTeamOnlyEnrollmentsForUser(?User $user, Team $leftTeam): void
    {
        if (! $user || $user->role !== 'student') {
            return;
        }

        foreach ($leftTeam->courses()->get() as $course) {
            $remainingTeamIds = $this->intIds($course->teams()->pluck('teams.id'));
            if ($this->userBelongsToAnyTeam($user, $remainingTeamIds)) {
                continue;
            }
            $this->detachIfTeamSourced($user, $course);
        }
    }

    /**
     * @param  array<int>  $removedTeamIds
     * @param  array<int>  $remainingTeamIds
     */
    private function revokeTeamOnlyEnrollmentsForCourse(Course $course, array $removedTeamIds, array $remainingTeamIds): void
    {
        if ($removedTeamIds === []) {
            return;
        }

        $candidateIds = User::query()
            ->where('role', 'student')
            ->whereHas('teams', fn ($q) => $q->whereIn('teams.id', $removedTeamIds))
            ->pluck('id');

        foreach ($candidateIds as $userId) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }
            if ($this->userBelongsToAnyTeam($user, $remainingTeamIds)) {
                continue;
            }
            $this->detachIfTeamSourced($user, $course);
        }
    }

    /**
     * @param  array<int>  $teamIds
     */
    private function userBelongsToAnyTeam(User $user, array $teamIds): bool
    {
        if ($teamIds === []) {
            return false;
        }

        return $user->teams()->whereIn('teams.id', $teamIds)->exists();
    }

    public function userKeepsCourseViaTeam(User $user, Course $course): bool
    {
        return $this->userBelongsToAnyTeam($user, $this->intIds($course->teams()->pluck('teams.id')));
    }

    /**
     * Constrânge eager-load-ul assignedUsers la atribuiri directe (panoul de distribuție).
     */
    public function constrainToDirectAssignedUsers($query, Course $course): void
    {
        if (SchemaCache::hasTable('course_user') && SchemaCache::hasColumn('course_user', 'enrolled')) {
            $query->wherePivot('enrolled', true);
        }
        if (! $this->hasAssignmentSourceColumn()) {
            return;
        }

        $teamIds = $this->intIds($course->relationLoaded('teams')
            ? $course->teams->pluck('id')
            : $course->teams()->pluck('teams.id'));

        $query->where(function ($inner) use ($teamIds) {
            $inner->where('course_user.assignment_source', self::SOURCE_DIRECT);
            if ($teamIds === []) {
                $inner->orWhereNull('course_user.assignment_source');
            } else {
                $inner->orWhere(function ($legacy) use ($teamIds) {
                    $legacy->whereNull('course_user.assignment_source')
                        ->whereDoesntHave('teams', fn ($t) => $t->whereIn('teams.id', $teamIds));
                });
            }
        });
    }

    private function isDirectAssignment(User $user, Course $course, $pivot): bool
    {
        if (! $this->hasAssignmentSourceColumn()) {
            return true;
        }
        $source = (string) ($pivot->assignment_source ?? '');
        if ($source === self::SOURCE_DIRECT) {
            return true;
        }
        if ($source === self::SOURCE_TEAM) {
            return false;
        }

        return ! $this->userKeepsCourseViaTeam($user, $course);
    }

    private function detachIfTeamSourced(User $user, Course $course): void
    {
        $pivot = $user->assignedCourses()->where('courses.id', $course->id)->first()?->pivot;
        if (! $pivot) {
            return;
        }
        if ($this->isDirectAssignment($user, $course, $pivot)) {
            return;
        }

        $user->assignedCourses()->detach($course->id);
        $this->forgetUserCourseCaches($user);
    }

    /**
     * @return array<string, mixed>
     */
    private function enrollmentPivot(string $source): array
    {
        $pivot = [
            'is_mandatory' => true,
            'assigned_at' => now(),
            'enrolled' => true,
            'enrolled_at' => now(),
        ];
        if ($this->hasAssignmentSourceColumn()) {
            $pivot['assignment_source'] = $source;
        }

        return $pivot;
    }

    private function hasAssignmentSourceColumn(): bool
    {
        return SchemaCache::hasTable('course_user') && SchemaCache::hasColumn('course_user', 'assignment_source');
    }

    /**
     * @param  iterable<int|string>  $ids
     * @return array<int>
     */
    private function intIds(iterable $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[] = (int) $id;
        }

        return array_values(array_unique($out));
    }

    private function forgetUserCourseCaches(User $user): void
    {
        Cache::forget("dashboard_user_{$user->id}_stats");
        Cache::forget("profile_user_{$user->id}");
    }
}
