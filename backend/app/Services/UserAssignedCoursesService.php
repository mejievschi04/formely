<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\TestResult;
use App\Models\User;
use App\Models\UserTestAttemptGrant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class UserAssignedCoursesService
{
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
                'assignedCourses.tests',
            ]);
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
                ->groupBy(fn ($row) => (int) $row->test_id . ':' . (int) ($row->course_id ?? 0));
            if (Schema::hasTable('user_test_attempt_grants')) {
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
            $isCompleted = $progress && ! empty($progress->completed_at);
            $hasStarted = $progress && (
                $courseProgressPercentage > 0
                || ! empty($progress->started_at)
                || ! empty($progress->enrolled_at)
            );
            $quizPassed = isset($courseExamMap[$course->id]) && $courseExamMap[$course->id] === true;
            $moduleCount = $course->modules ? $course->modules->count() : 0;
            $assignedAt = $course->pivot->assigned_at ?? null;

            $courseTests = [];
            foreach ($course->tests ?? [] as $test) {
                $courseKey = (int) $test->id . ':' . (int) $course->id;
                $genericKey = (int) $test->id . ':0';
                $resultsForTest = $latestTestResults->get($courseKey) ?? $latestTestResults->get($genericKey) ?? collect();
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
}
