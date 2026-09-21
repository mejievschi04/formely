<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Exam;
use App\Models\Test;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\CourseProgressService;
use App\Support\LearningVisibility;
use App\Support\StudentActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class CourseProgressController extends Controller
{
    protected $progressService;

    public function __construct(CourseProgressService $progressService)
    {
        $this->progressService = $progressService;
    }

    private function isEnrolled(User $user, Course $course): bool
    {
        return DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->exists();
    }

    /**
     * @param  array<string, mixed>  $accessStatus
     * @return array<string, mixed>
     */
    private function withFlattenedLessonProgress(array $accessStatus): array
    {
        $accessStatus['lessons'] = collect($accessStatus['root_lessons'] ?? [])
            ->concat(
                collect($accessStatus['modules'] ?? [])
                    ->flatMap(fn ($m) => collect($m['lessons'] ?? []))
            )
            ->map(fn ($l) => [
                'lesson_id' => $l['id'],
                'completed' => $l['completed'] ?? false,
                'progress_percentage' => $l['progress_percentage'] ?? 0,
            ])
            ->values()
            ->all();

        return $accessStatus;
    }

    /**
     * @param  array<string, mixed>  $accessStatus
     * @return array<string, mixed>
     */
    private function withProgressNavigation(User $user, Course $course, array $accessStatus): array
    {
        if ($user->isLearningActivityExempt()) {
            $accessStatus['next_lesson'] = null;
            $accessStatus['next_exam'] = null;
            $accessStatus['can_progress'] = true;
            $accessStatus['course_complete'] = false;

            return $accessStatus;
        }

        try {
            $nextLesson = $this->progressService->getNextIncompleteLesson($user, $course);
            $accessStatus['next_lesson'] = $nextLesson ? [
                'id' => $nextLesson->id,
                'title' => $nextLesson->title ?? '',
                'module_id' => $nextLesson->module_id ?? null,
            ] : null;
        } catch (\Exception $e) {
            \Log::warning('Error getting next lesson', [
                'course_id' => $course->id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            $accessStatus['next_lesson'] = null;
        }

        try {
            $nextTest = $this->progressService->getNextIncompleteTest($user, $course);
            $accessStatus['next_exam'] = $nextTest ? [
                'id' => $nextTest->id,
                'title' => $nextTest->title ?? '',
                'module_id' => null,
            ] : null;
        } catch (\Exception $e) {
            \Log::warning('Error getting next test', [
                'course_id' => $course->id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            $accessStatus['next_exam'] = null;
        }

        try {
            $accessStatus['can_progress'] = $this->progressService->canUserProgress($user, $course);
        } catch (\Exception $e) {
            $accessStatus['can_progress'] = false;
        }

        try {
            $accessStatus['course_complete'] = $this->progressService->isCourseComplete($user, $course);
        } catch (\Exception $e) {
            $accessStatus['course_complete'] = false;
        }

        return $accessStatus;
    }

    /**
     * Get user's progress for a course
     */
    public function getCourseProgress($courseId)
    {
        try {
            $user = Auth::user();
            if (!$user) {
                return response()->json([
                    'message' => 'Utilizator neautentificat',
                ], 401);
            }

            $course = Course::findOrFail($courseId);
            if (! LearningVisibility::courseVisibleToLearner($user, $course)) {
                abort(404, 'Curs negăsit.');
            }
            $isLearningExempt = $user->isLearningActivityExempt();

            // Recalculate progress in real-time
            try {
                $this->progressService->calculateCourseProgress($user, $course);
            } catch (\Exception $e) {
                \Log::warning('Error calculating course progress', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
            }

            // Get access status (includes progress)
            try {
                $accessStatus = $this->withFlattenedLessonProgress(
                    $this->progressService->getUserAccessStatus($user, $course)
                );
                // Alias for frontend compatibility
                $accessStatus['progress_percentage'] = $accessStatus['course_progress'] ?? 0;
            } catch (\Exception $e) {
                \Log::error('Error getting user access status', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
                // Return minimal access status if service fails
                $accessStatus = [
                    'enrolled' => $this->isEnrolled($user, $course),
                    'progress_percentage' => 0,
                    'can_progress' => false,
                    'course_complete' => false,
                ];
            }

            if ($isLearningExempt) {
                $accessStatus['progress_percentage'] = 0;
                $accessStatus['lessons'] = collect($accessStatus['root_lessons'] ?? [])
                    ->concat(
                        collect($accessStatus['modules'] ?? [])
                            ->flatMap(fn ($m) => collect($m['lessons'] ?? []))
                    )
                    ->map(fn ($l) => [
                        'lesson_id' => $l['id'],
                        'completed' => false,
                        'progress_percentage' => 0,
                    ])
                    ->values()
                    ->all();
                $accessStatus['next_lesson'] = null;
                $accessStatus['next_exam'] = null;
                $accessStatus['can_progress'] = true;
                $accessStatus['course_complete'] = false;
                $accessStatus['enrolled'] = false;

                return response()->json($accessStatus);
            }

            $accessStatus = $this->withProgressNavigation($user, $course, $accessStatus);
            $accessStatus['enrolled'] = $this->isEnrolled($user, $course);

            return response()->json($accessStatus);
        } catch (\Exception $e) {
            \Log::error('Error in CourseProgressController::getCourseProgress', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'error' => 'Nu s-a putut încărca progresul cursului',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Enrollment is assignment-only. Opening a course never enrolls the learner.
     */
    public function enrollCourse($courseId)
    {
        try {
            $user = Auth::user();
            if (!$user) {
                return response()->json([
                    'message' => 'Utilizator neautentificat',
                ], 401);
            }

            if ($user->isLearningActivityExempt()) {
                return response()->json([
                    'message' => 'Acest rol nu necesita inscriere in curs.',
                    'enrolled' => false,
                ]);
            }

            $course = Course::findOrFail($courseId);

            if ($this->isEnrolled($user, $course)) {
                $accessStatus = $this->progressService->getUserAccessStatus($user, $course);
                $accessStatus['progress_percentage'] = $accessStatus['course_progress'] ?? 0;

                return response()->json([
                    'message' => 'Ești deja înscris la acest curs.',
                    'enrolled' => true,
                    'progress' => $accessStatus,
                ]);
            }

            return response()->json([
                'message' => 'Înscrierea se face doar prin atribuire, nu prin accesarea cursului.',
                'enrolled' => false,
            ], 403);
        } catch (\Exception $e) {
            \Log::error('Error in CourseProgressController::enrollCourse', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Nu s-a putut inscrie in curs',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Student: after the last lesson, mark course finished when no required test remains (or course already complete).
     */
    public function finishCourse($courseId)
    {
        try {
            $user = Auth::user();
            if (!$user) {
                return response()->json(['message' => 'Utilizator neautentificat'], 401);
            }

            $course = Course::findOrFail($courseId);

            if (! LearningVisibility::courseVisibleToLearner($user, $course)) {
                abort(404, 'Curs negăsit.');
            }

            if ($user->isLearningActivityExempt()) {
                return response()->json([
                    'message' => 'Cursul poate fi navigat fără finalizare obligatorie pentru acest rol.',
                    'completed_at' => null,
                ]);
            }

            $this->progressService->calculateCourseProgress($user, $course);

            // Aceleași reguli ca isCourseComplete: toate lecțiile + toate testele publicate din course_test
            if (!$this->progressService->isCourseComplete($user, $course)) {
                $nextTest = $this->progressService->getNextIncompleteTest($user, $course);

                return response()->json([
                    'message' => 'Trebuie să finalizezi toate lecțiile și să promovezi testele cursului înainte de finalizare.',
                    'next_test_id' => $nextTest?->id,
                ], 409);
            }

            $existing = DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->first();

            $wasAlreadyCompleted = $existing && $existing->completed_at;

            if (!$existing) {
                DB::table('course_user')->insert([
                    'user_id' => $user->id,
                    'course_id' => $course->id,
                    'enrolled' => false,
                    'enrolled_at' => now(),
                    'progress_percentage' => 100,
                    'completed_at' => now(),
                    'started_at' => now(),
                    'is_mandatory' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                $completedAt = $existing->completed_at ?? now();
                DB::table('course_user')
                    ->where('user_id', $user->id)
                    ->where('course_id', $course->id)
                    ->update([
                        'progress_percentage' => 100,
                        'completed_at' => $completedAt,
                        'updated_at' => now(),
                    ]);
            }

            if (! $wasAlreadyCompleted) {
                StudentActivityLogger::logCompletedCourseIfFirst($user, $course);
            }

            \Illuminate\Support\Facades\Cache::forget("dashboard_user_{$user->id}_stats");
            \Illuminate\Support\Facades\Cache::forget("profile_user_{$user->id}");

            $completedAtOut = $wasAlreadyCompleted
                ? $existing->completed_at
                : now()->toDateTimeString();

            return response()->json([
                'message' => 'Cursul a fost marcat ca finalizat.',
                'completed_at' => $completedAtOut,
            ]);
        } catch (\Exception $e) {
            \Log::error('Error in CourseProgressController::finishCourse', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Nu s-a putut finaliza cursul',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Mark lesson as completed
     */
    public function completeLesson(Request $request, $lessonId)
    {
        $user = Auth::user();
        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'message' => 'Lecția a fost deschisă fără a fi înregistrată în progres.',
            ]);
        }
        $lesson = Lesson::with(['module.course', 'course'])->findOrFail($lessonId);

        $module = $lesson->module;
        $course = $module?->course ?: $lesson->course;
        if (!$course) {
            return response()->json([
                'message' => 'Lecția nu aparține unui curs',
            ], 400);
        }

        if (! LearningVisibility::courseVisibleToLearner($user, $course)) {
            abort(404, 'Lecție negăsită.');
        }
        if (! LearningVisibility::isStaff($user) && ($lesson->status ?? 'draft') !== 'published') {
            abort(404, 'Lecție negăsită.');
        }

        $isUnlocked = $this->progressService->isLessonUnlocked($user, $lesson, $module, $course);
        if (!$isUnlocked) {
            return response()->json([
                'message' => 'Lecția este blocată. Completează lecțiile anterioare.',
            ], 403);
        }

        $this->progressService->completeLesson($user, $lesson);
        $accessStatus = $this->withFlattenedLessonProgress(
            $this->progressService->getUserAccessStatus($user, $course)
        );
        $accessStatus['progress_percentage'] = $accessStatus['course_progress'] ?? 0;
        $accessStatus = $this->withProgressNavigation($user, $course, $accessStatus);

        return response()->json([
            'message' => 'Lecție finalizată cu succes',
            'progress' => $accessStatus,
        ]);
    }

    /**
     * Check access to a module
     */
    public function checkModuleAccess($moduleId)
    {
        $user = Auth::user();
        $module = Module::with('course')->findOrFail($moduleId);
        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'unlocked' => true,
                'progress' => 0,
            ]);
        }

        $isUnlocked = $this->progressService->isModuleUnlocked($user, $module, $module->course);
        $progress = $this->progressService->calculateModuleProgress($user, $module);

        return response()->json([
            'unlocked' => $isUnlocked,
            'progress' => $progress,
        ]);
    }

    /**
     * Check access to a lesson
     */
    public function checkLessonAccess($lessonId)
    {
        $user = Auth::user();
        $lesson = Lesson::with(['module', 'module.course', 'course'])->findOrFail($lessonId);
        $course = $lesson->module?->course ?: $lesson->course;
        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'unlocked' => true,
                'completed' => false,
                'is_preview' => $lesson->is_preview,
            ]);
        }

        if (!$course) {
            return response()->json([
                'message' => 'Lecția nu aparține unui curs',
            ], 400);
        }

        $isUnlocked = $this->progressService->isLessonUnlocked(
            $user,
            $lesson,
            $lesson->module,
            $course
        );

        $isCompleted = \DB::table('lesson_progress')
            ->where('user_id', $user->id)
            ->where('lesson_id', $lessonId)
            ->where('completed', true)
            ->exists();

        $dripUnlockAt = app(\App\Services\DripContentService::class)
            ->getLessonUnlockAtForUser($user, $course, $lesson);

        return response()->json([
            'unlocked' => $isUnlocked,
            'completed' => $isCompleted,
            'is_preview' => $lesson->is_preview,
            'drip_unlock_at' => $dripUnlockAt?->toIso8601String(),
        ]);
    }

    /**
     * Check access to an exam or a course test (Test id).
     * For tests linked to multiple courses, pass ?course_id=...
     */
    public function checkExamAccess(Request $request, $examId)
    {
        $user = Auth::user();
        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'unlocked' => true,
                'is_required' => false,
            ]);
        }

        $test = Test::find($examId);
        if ($test) {
            $courseId = $request->query('course_id') ? (int) $request->query('course_id') : null;
            if (!$courseId) {
                $rows = \App\Models\CourseTest::where('test_id', $test->id)->get();
                if ($rows->count() === 1) {
                    $courseId = (int) $rows->first()->course_id;
                }
            }
            if (!$courseId) {
                return response()->json([
                    'message' => 'Pentru acest test specifică cursul în query (?course_id=...).',
                    'unlocked' => false,
                    'is_required' => false,
                ], 422);
            }

            $course = Course::findOrFail($courseId);
            $isUnlocked = $this->progressService->isTestUnlocked($user, $test, $course);
            $courseTest = \App\Models\CourseTest::where('test_id', $test->id)
                ->where('course_id', $courseId)
                ->first();

            return response()->json([
                'unlocked' => $isUnlocked,
                'is_required' => (bool) ($courseTest && ($courseTest->required ?? false)),
            ]);
        }

        $exam = Exam::with(['module', 'lesson'])->findOrFail($examId);

        $module = $exam->module;
        $lesson = $exam->lesson;

        $isUnlocked = $this->progressService->isExamUnlocked($user, $exam, $module, $lesson);

        return response()->json([
            'unlocked' => $isUnlocked,
            'is_required' => $exam->is_required ?? false,
        ]);
    }

    /**
     * Update lesson progress (auto-complete when 100%)
     */
    public function updateLessonProgress(Request $request, $lessonId)
    {
        $user = Auth::user();
        $lesson = Lesson::findOrFail($lessonId);

        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'message' => 'Progresul nu este înregistrat pentru acest rol.',
                'progress_percentage' => 0,
                'last_milestone_reached' => 0,
                'completed' => false,
                'auto_completed' => false,
            ]);
        }

        $validated = $request->validate([
            'progress_percentage' => 'nullable|numeric|min:0|max:100',
            'milestone' => 'nullable|numeric|min:0|max:100',
            'milestone_reached' => 'nullable|numeric|min:0|max:100',
            'time_spent_seconds' => 'nullable|integer|min:0',
            'add_time_spent_seconds' => 'nullable|integer|min:0|max:7200',
        ]);

        $existingProgress = \DB::table('lesson_progress')
            ->where('user_id', $user->id)
            ->where('lesson_id', $lessonId)
            ->first();

        $isAlreadyCompleted = $existingProgress && $existingProgress->completed;
        $existingProgressPercentage = (float) ($existingProgress->progress_percentage ?? 0);
        $incomingMilestone = null;
        if (array_key_exists('milestone_reached', $validated) && $validated['milestone_reached'] !== null) {
            $incomingMilestone = (float) $validated['milestone_reached'];
        } elseif (array_key_exists('milestone', $validated) && $validated['milestone'] !== null) {
            $incomingMilestone = (float) $validated['milestone'];
        }

        $progressPercentage = array_key_exists('progress_percentage', $validated) && $validated['progress_percentage'] !== null
            ? (float) $validated['progress_percentage']
            : $existingProgressPercentage;

        if ($incomingMilestone !== null) {
            $progressPercentage = max($progressPercentage, $incomingMilestone, $existingProgressPercentage);
        }

        $lastMilestoneReached = $incomingMilestone !== null
            ? max((float) ($existingProgress?->last_milestone_reached ?? 0), $incomingMilestone)
            : (float) ($existingProgress?->last_milestone_reached ?? 0);

        $shouldAutoComplete = ! $isAlreadyCompleted && ($progressPercentage >= 100 || $lastMilestoneReached >= 100);
        $didAutoCompleteNow = false;

        if ($isAlreadyCompleted) {
            $progressPercentage = 100;
            $lastMilestoneReached = max($lastMilestoneReached, 100);
        }

        if ($shouldAutoComplete && ! $isAlreadyCompleted) {
            $lesson->loadMissing(['module.course', 'course']);
            $course = $lesson->module?->course ?: $lesson->course;
            if ($course) {
                $this->progressService->completeLesson($user, $lesson);
                $didAutoCompleteNow = true;
                $isAlreadyCompleted = true;
                $progressPercentage = 100;
                $lastMilestoneReached = 100;
            }
        }

        $existingTime = (int) ($existingProgress->time_spent_seconds ?? 0);
        if (!empty($validated['add_time_spent_seconds'])) {
            $timeSpent = $existingTime + min(7200, max(0, (int) $validated['add_time_spent_seconds']));
        } elseif (array_key_exists('time_spent_seconds', $validated) && $validated['time_spent_seconds'] !== null) {
            $timeSpent = max((int) $validated['time_spent_seconds'], $existingTime);
        } else {
            $timeSpent = $existingTime;
        }

        // Update or create lesson progress (created_at obligatoriu la insert pe unele DB)
        $now = now();
        $payload = [
            'progress_percentage' => $progressPercentage,
            'time_spent_seconds' => $timeSpent,
            'completed' => $didAutoCompleteNow || $isAlreadyCompleted || $shouldAutoComplete,
            'completed_at' => ($didAutoCompleteNow || $isAlreadyCompleted)
                ? (($existingProgress?->completed_at) ?: $now)
                : ($existingProgress?->completed_at),
            'started_at' => ($existingProgress && !empty($existingProgress->started_at))
                ? $existingProgress->started_at
                : $now,
            'updated_at' => $now,
            'created_at' => $existingProgress ? ($existingProgress->created_at ?? $now) : $now,
        ];

        if (\Schema::hasColumn('lesson_progress', 'last_milestone_reached')) {
            $payload['last_milestone_reached'] = $lastMilestoneReached;
        }

        \DB::table('lesson_progress')->updateOrInsert(
            [
                'user_id' => $user->id,
                'lesson_id' => $lessonId,
            ],
            $payload
        );

        return response()->json([
            'message' => 'Progres actualizat',
            'progress_percentage' => $progressPercentage,
            'last_milestone_reached' => $lastMilestoneReached,
            'completed' => $didAutoCompleteNow || $isAlreadyCompleted || $shouldAutoComplete,
            'auto_completed' => $didAutoCompleteNow,
        ]);
    }
}



