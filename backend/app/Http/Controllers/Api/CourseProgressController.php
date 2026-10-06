<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\CourseProgressService;
use App\Services\PublishedCourseView;
use App\Support\LearningVisibility;
use App\Support\StudentActivityLogger;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class CourseProgressController extends Controller
{
    protected $progressService;

    public function __construct(CourseProgressService $progressService)
    {
        $this->progressService = $progressService;
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

            // Check if user is enrolled
            $enrollment = \DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $courseId)
                ->where('enrolled', true)
                ->first();

            // Cursantul primește cursuri doar prin atribuire (ca la GET /courses/{id}); fără înscriere
            // automată, altfel deschiderea adresei unui curs neatribuit îl înscria pe loc.
            if (! $enrollment && ! $isLearningExempt && ! LearningVisibility::isStaff($user)) {
                return response()->json([
                    'error' => 'Cursul nu îți este atribuit.',
                ], 403);
            }

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
                    'enrolled' => true,
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

            // Get next incomplete lesson (for resume functionality)
            try {
                $nextLesson = $this->progressService->getNextIncompleteLesson($user, $course);
                $accessStatus['next_lesson'] = $nextLesson ? [
                    'id' => $nextLesson->id,
                    'title' => $nextLesson->title ?? '',
                    'module_id' => $nextLesson->module_id ?? null,
                ] : null;
            } catch (\Exception $e) {
                \Log::warning('Error getting next lesson', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
                $accessStatus['next_lesson'] = null;
            }

            // Get next incomplete test (using getNextIncompleteTest instead of getNextIncompleteExam)
            try {
                $nextTest = $this->progressService->getNextIncompleteTest($user, $course);
                $accessStatus['next_exam'] = $nextTest ? [
                    'id' => $nextTest->id,
                    'title' => $nextTest->title ?? '',
                    'module_id' => null, // Tests are linked via CourseTest, not directly to modules
                ] : null;
            } catch (\Exception $e) {
                \Log::warning('Error getting next test', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
                $accessStatus['next_exam'] = null;
            }

            // Check if user can progress (all required exams passed)
            try {
                $accessStatus['can_progress'] = $this->progressService->canUserProgress($user, $course);
            } catch (\Exception $e) {
                \Log::warning('Error checking if user can progress', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
                $accessStatus['can_progress'] = false;
            }

            // Check if course is complete
            try {
                $accessStatus['course_complete'] = $this->progressService->isCourseComplete($user, $course);
            } catch (\Exception $e) {
                \Log::warning('Error checking if course is complete', [
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
                $accessStatus['course_complete'] = false;
            }

            return response()->json($accessStatus);
        } catch (ModelNotFoundException|HttpExceptionInterface $e) {
            // Curs inexistent sau interzis: 404/403, nu eroare de server.
            throw $e;
        } catch (\Exception $e) {
            \Log::error('Error in CourseProgressController::getCourseProgress', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'error' => 'Nu s-a putut încărca progresul cursului',
                'message' => config('app.debug') ? $e->getMessage() : null,
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

            $enrolled = LearningVisibility::isEnrolledInCourse($user, (int) $course->id);
            if (! $enrolled && ! $user->isLearningActivityExempt()) {
                return response()->json([
                    'message' => 'Nu ești înscris la acest curs.',
                ], 403);
            }

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
                    'enrolled' => true,
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
        } catch (ModelNotFoundException|HttpExceptionInterface $e) {
            // Curs inexistent sau interzis: 404/403, nu eroare de server.
            throw $e;
        } catch (\Exception $e) {
            \Log::error('Error in CourseProgressController::finishCourse', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Nu s-a putut finaliza cursul',
                'message' => config('app.debug') ? $e->getMessage() : null,
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
        $lesson = Lesson::with(['module.course', 'course'])->find($lessonId);
        if (! $lesson) {
            return $this->removedLessonResponse($request, (int) $lessonId);
        }

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
        $onPublishedSnapshot = $this->progressService->lessonIsOnPublishedSnapshot($user, $course, (int) $lesson->id);
        if (! LearningVisibility::isStaff($user) && ($lesson->status ?? 'draft') !== 'published' && ! $onPublishedSnapshot) {
            abort(404, 'Lecție negăsită.');
        }

        $enrollment = \DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->first();

        if (! $enrollment && ! LearningVisibility::isStaff($user)) {
            return response()->json([
                'message' => 'Nu ești înscris la acest curs.',
            ], 403);
        }

        if (! $this->learnerMayFinishOpenLesson($user, $lesson, $course)) {
            return response()->json([
                'message' => 'Lecția este blocată. Completează lecțiile anterioare.',
            ], 403);
        }

        $this->progressService->completeLesson($user, $lesson);
        $accessStatus = $this->withFlattenedLessonProgress(
            $this->progressService->getUserAccessStatus($user, $course)
        );
        $accessStatus['progress_percentage'] = $accessStatus['course_progress'] ?? 0;

        return response()->json([
            'message' => 'Lecție finalizată cu succes',
            'progress' => $accessStatus,
        ]);
    }

    /**
     * Lecție ștearsă de admin, dar încă în versiunea publicată pe care o vede cursantul (până la
     * următoarea publicare): nu mai contează la progres, deci finalizarea ei nu are ce înregistra.
     * Răspundem cu succes în loc de 404, ca trecerea la lecția următoare să nu afișeze o eroare.
     */
    private function removedLessonResponse(Request $request, int $lessonId)
    {
        $user = Auth::user();
        $published = app(PublishedCourseView::class)->hydratePublishedLesson($lessonId, $request);
        $course = $published?->course;
        if (! $course || ! LearningVisibility::courseVisibleToLearner($user, $course)) {
            abort(404, 'Lecție negăsită.');
        }

        $accessStatus = $this->withFlattenedLessonProgress(
            $this->progressService->getUserAccessStatus($user, $course)
        );
        $accessStatus['progress_percentage'] = $accessStatus['course_progress'] ?? 0;

        return response()->json([
            'message' => 'Lecția nu mai face parte din curs.',
            'lesson_removed' => true,
            'completed' => true,
            'progress_percentage' => 100,
            'progress' => $accessStatus,
        ]);
    }

    /**
     * Update lesson progress (auto-complete when 100%)
     */
    public function updateLessonProgress(Request $request, $lessonId)
    {
        $user = Auth::user();
        $lesson = Lesson::with(['module.course', 'course'])->find($lessonId);
        if (! $lesson) {
            return $this->removedLessonResponse($request, (int) $lessonId);
        }

        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'message' => 'Progresul nu este înregistrat pentru acest rol.',
                'progress_percentage' => 0,
                'last_milestone_reached' => 0,
                'completed' => false,
                'auto_completed' => false,
            ]);
        }

        $course = $lesson->module?->course ?: $lesson->course;
        if (! $course) {
            return response()->json(['message' => 'Lecția nu aparține unui curs.'], 400);
        }

        $coursePublished = ($course->status ?? '') === 'published';
        $isPreview = (bool) ($lesson->is_preview ?? false);
        if (! $coursePublished && ! $isPreview) {
            return response()->json(['message' => 'Lecția nu este disponibilă.'], 403);
        }

        $enrolled = false;
        if (SchemaCache::hasTable('course_user')) {
            $enrolledQuery = \DB::table('course_user')
                ->where('course_id', $course->id)
                ->where('user_id', $user->id);
            if (SchemaCache::hasColumn('course_user', 'enrolled')) {
                $enrolledQuery->where('enrolled', true);
            }
            $enrolled = $enrolledQuery->exists();
        }
        if (! $enrolled && ! $isPreview) {
            return response()->json(['message' => 'Nu ești înscris la acest curs.'], 403);
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

        $lesson->loadMissing('contentBlocks');
        $now = now();
        $startedAt = ($existingProgress && ! empty($existingProgress->started_at))
            ? Carbon::parse($existingProgress->started_at)
            : $now;
        $elapsedWall = max(0, $now->getTimestamp() - $startedAt->getTimestamp());
        $minDwell = $this->progressService->minimumAutoCompleteDwellSeconds($lesson);
        $dwellMet = $elapsedWall >= $minDwell;

        $wantsComplete = $progressPercentage >= 100 || $lastMilestoneReached >= 100;
        if ($isAlreadyCompleted) {
            $progressPercentage = 100;
            $lastMilestoneReached = max($lastMilestoneReached, 100);
            $wantsComplete = false;
            $dwellMet = true;
        } elseif ($wantsComplete && ! $dwellMet) {
            $progressPercentage = min($progressPercentage, 99.0);
            $lastMilestoneReached = min($lastMilestoneReached, 99.0);
        }

        $shouldAutoComplete = ! $isAlreadyCompleted && ($progressPercentage >= 100 || $lastMilestoneReached >= 100) && $dwellMet;
        $didAutoCompleteNow = false;

        if (! $this->learnerMayRecordLessonProgress($user, $lesson, $course)) {
            return response()->json([
                'message' => 'Lecția este blocată. Completează lecțiile anterioare.',
                'locked' => true,
            ], 403);
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
            $incomingTime = max(0, (int) $validated['time_spent_seconds']);
            $timeSpent = min($incomingTime, $existingTime + 7200);
            $timeSpent = max($timeSpent, $existingTime);
        } else {
            $timeSpent = $existingTime;
        }

        // Update or create lesson progress (created_at obligatoriu la insert pe unele DB)
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

        if (\App\Support\SchemaCache::hasColumn('lesson_progress', 'last_milestone_reached')) {
            $payload['last_milestone_reached'] = $lastMilestoneReached;
        }

        $saved = $this->writeLessonProgressWithoutClearingCompletion(
            (int) $user->id,
            (int) $lessonId,
            $existingProgress,
            $payload
        );

        return response()->json([
            'message' => 'Progres actualizat',
            'progress_percentage' => $saved['progress_percentage'],
            'last_milestone_reached' => $saved['completed'] ? max($lastMilestoneReached, 100) : $lastMilestoneReached,
            'completed' => $saved['completed'],
            'auto_completed' => $didAutoCompleteNow && $saved['completed'],
            'awaiting_dwell' => $wantsComplete && ! $saved['completed'] && ! $dwellMet,
            'min_dwell_seconds' => $minDwell,
        ]);
    }

    /**
     * Heartbeat-ul de timp poate citi rândul înainte de „Următoarea” și să-l rescrie după.
     * Scrierea nu are voie să șteargă o finalizare deja comisă.
     *
     * @param  array<string, mixed>  $payload
     * @return array{completed: bool, progress_percentage: float}
     */
    private function writeLessonProgressWithoutClearingCompletion(int $userId, int $lessonId, ?object $seen, array $payload): array
    {
        $keys = [
            'user_id' => $userId,
            'lesson_id' => $lessonId,
        ];

        $preserveCompletion = function (?object $row) use (&$payload): void {
            $alreadyDone = $row && (
                (bool) $row->completed || (int) ($row->progress_percentage ?? 0) >= 100
            );
            if (! $alreadyDone) {
                return;
            }
            $payload['completed'] = true;
            $payload['progress_percentage'] = 100;
            $payload['completed_at'] = $row->completed_at ?: ($payload['completed_at'] ?? now());
            if (array_key_exists('last_milestone_reached', $payload)) {
                $payload['last_milestone_reached'] = max(100, (float) $payload['last_milestone_reached']);
            }
        };

        return \DB::transaction(function () use ($keys, &$payload, $preserveCompletion, $lessonId) {
            \DB::table('lessons')->where('id', $lessonId)->lockForUpdate()->first();
            $rows = \DB::table('lesson_progress')->where($keys)->lockForUpdate()->get();
            if ($rows->isEmpty()) {
                try {
                    \DB::table('lesson_progress')->insert(array_merge($keys, $payload));

                    return [
                        'completed' => (bool) $payload['completed'],
                        'progress_percentage' => (float) $payload['progress_percentage'],
                    ];
                } catch (\Illuminate\Database\QueryException $e) {
                    $sqlState = (string) ($e->errorInfo[0] ?? '');
                    if (! in_array($sqlState, ['23000', '23505'], true)) {
                        throw $e;
                    }
                    $rows = \DB::table('lesson_progress')->where($keys)->lockForUpdate()->get();
                }
            }

            foreach ($rows as $row) {
                $preserveCompletion($row);
            }
            if ($rows->isNotEmpty()) {
                \DB::table('lesson_progress')->where($keys)->update($payload);
            }

            return [
                'completed' => (bool) $payload['completed'],
                'progress_percentage' => (float) $payload['progress_percentage'],
            ];
        });
    }

    /**
     * Marcarea explicită (butonul Următoarea) salvează lecția publicată la care ești înscris.
     */
    private function learnerMayFinishOpenLesson($user, Lesson $lesson, Course $course): bool
    {
        if (! $user || LearningVisibility::isStaff($user) || (bool) ($lesson->is_preview ?? false)) {
            return true;
        }
        if (! LearningVisibility::isEnrolledInCourse($user, (int) $course->id)) {
            return false;
        }
        if (($lesson->status ?? 'draft') === 'published') {
            return true;
        }

        return $this->progressService->lessonIsOnPublishedSnapshot($user, $course, (int) $lesson->id);
    }

    /**
     * Aceeași regulă ca la deschiderea lecției: dacă textul se încarcă, progresul se poate salva.
     */
    private function learnerMayRecordLessonProgress($user, Lesson $lesson, Course $course): bool
    {
        if (! $user || LearningVisibility::isStaff($user) || (bool) ($lesson->is_preview ?? false)) {
            return true;
        }

        $view = app(PublishedCourseView::class);
        if ($view->shouldServeSnapshot($course, request())) {
            $overlay = $view->overlayLesson($lesson, $view->latestPublishedSnapshot((int) $course->id));
            if ($overlay) {
                $lesson = $overlay;
            }
        }

        return $this->progressService->isLessonUnlocked($user, $lesson, $lesson->module, $course);
    }

}