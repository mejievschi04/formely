<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Exam;
use App\Models\Module;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\User;
use App\Models\CourseTest;
use App\Models\ActivityLog;
use App\Support\LearningVisibility;
use App\Support\StudentActivityLogger;
use Illuminate\Support\Facades\DB;
use App\Support\SchemaCache;
use Carbon\Carbon;

class CourseProgressService
{
    protected ProgressionEngine $progressionEngine;

    /** @var array<int, array<int, object>> */
    private array $lessonProgressByUser = [];

    /** @var array<string, float> */
    private array $courseProgressMemo = [];

    /** @var array<string, array> */
    private array $accessStatusMemo = [];

    /** @var array<string, array|null> */
    private array $learnerOutlineMemo = [];

    public function __construct(ProgressionEngine $progressionEngine)
    {
        $this->progressionEngine = $progressionEngine;
    }

    private function forgetUserProgressCache(User $user, ?int $courseId = null): void
    {
        unset($this->lessonProgressByUser[$user->id]);
        $this->progressionEngine->forgetUser((int) $user->id);
        if ($courseId !== null) {
            unset($this->courseProgressMemo[$user->id . ':' . $courseId], $this->accessStatusMemo[$user->id . ':' . $courseId]);
            return;
        }
        $prefix = $user->id . ':';
        foreach (array_keys($this->courseProgressMemo) as $key) {
            if (str_starts_with($key, $prefix)) {
                unset($this->courseProgressMemo[$key]);
            }
        }
        foreach (array_keys($this->accessStatusMemo) as $key) {
            if (str_starts_with($key, $prefix)) {
                unset($this->accessStatusMemo[$key]);
            }
        }
    }

    /**
     * @return array<int, object>
     */
    private function lessonProgressMap(User $user): array
    {
        if (isset($this->lessonProgressByUser[$user->id])) {
            return $this->lessonProgressByUser[$user->id];
        }

        $map = [];
        foreach (DB::table('lesson_progress')->where('user_id', $user->id)->orderBy('id')->get(['lesson_id', 'completed', 'progress_percentage']) as $row) {
            $lessonId = (int) $row->lesson_id;
            $current = $map[$lessonId] ?? null;
            if ($current === null || ($this->progressRowIsComplete($row) && ! $this->progressRowIsComplete($current))) {
                $map[$lessonId] = $row;
            }
        }

        return $this->lessonProgressByUser[$user->id] = $map;
    }

    /**
     * @return array<int, true>
     */
    private function passedTestIdSet(User $user, int $courseId): array
    {
        $query = DB::table('test_results')
            ->where('user_id', $user->id)
            ->where('percentage', '>=', self::COURSE_COMPLETION_TEST_PERCENT)
            ->whereNotIn('status', ['in_progress', 'pending_review']);

        if (SchemaCache::hasColumn('test_results', 'needs_manual_review')) {
            $query->where(function ($q) {
                $q->whereNull('needs_manual_review')->orWhere('needs_manual_review', false);
            });
        }

        $ids = [];
        foreach ($query->pluck('test_id') as $id) {
            $ids[(int) $id] = true;
        }

        return $ids;
    }

    private function hasPassedTestResult(User $user, int $testId, int $courseId, ?array $passedIds = null): bool
    {
        $passedIds ??= $this->passedTestIdSet($user, $courseId);

        return isset($passedIds[$testId]);
    }

    private function progressRowIsComplete(?object $row): bool
    {
        if (!$row) {
            return false;
        }

        return (bool) ($row->completed ?? false) || (int) ($row->progress_percentage ?? 0) >= 100;
    }

    protected function getCourseRootLessons(Course $course)
    {
        if ($course->relationLoaded('lessons')) {
            return $course->lessons
                ->whereNull('module_id')
                ->where('status', 'published')
                ->sortBy('order')
                ->values();
        }

        return $course->lessons()
            ->whereNull('module_id')
            ->where('status', 'published')
            ->orderBy('order')
            ->get();
    }

    protected function isLessonMarkedComplete(User $user, int $lessonId): bool
    {
        if ($user->isLearningActivityExempt()) {
            return false;
        }

        return $this->progressRowIsComplete($this->lessonProgressMap($user)[$lessonId] ?? null);
    }
    private const COURSE_COMPLETION_TEST_PERCENT = 80;

    private const COURSE_TEST_PROGRESS_SHARE = 10.0;

    /**
     * Calculate course progress for a user
     */
    public function calculateCourseProgress(User $user, Course $course): float
    {
        if ($user->isLearningActivityExempt()) {
            return 0;
        }

        $memoKey = $user->id . ':' . $course->id;
        if (isset($this->courseProgressMemo[$memoKey])) {
            return $this->courseProgressMemo[$memoKey];
        }

        $row = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first(array_merge(
                ['progress_percentage', 'completed_at', 'manually_completed'],
                SchemaCache::hasColumn('course_user', 'progress_floor') ? ['progress_floor'] : []
            ));

        if ($row && SchemaCache::hasColumn('course_user', 'manually_completed') && ($row->manually_completed ?? false)) {
            return $this->courseProgressMemo[$memoKey] = 100.0;
        }

        $lessonIds = $this->requiredLessonIds($user, $course);
        $totalLessons = $lessonIds->count();
        $progressMap = $this->lessonProgressMap($user);
        $completedLessons = $totalLessons === 0 ? 0 : $lessonIds->filter(
            fn ($id) => $this->progressRowIsComplete($progressMap[(int) $id] ?? null)
        )->count();

        $publishedTests = $this->requiredPublishedTests($user, $course);
        $hasTests = $publishedTests->isNotEmpty();
        $testsPassed = ! $hasTests || $this->allCourseTestsMeetCompletionThreshold($user, $course, $publishedTests);

        if ($totalLessons === 0 && ! $hasTests) {
            return $this->courseProgressMemo[$memoKey] = 0;
        }

        $lessonPct = $totalLessons === 0 ? 100.0 : ($completedLessons / $totalLessons) * 100;
        if ($hasTests) {
            $progress = ($lessonPct * ((100 - self::COURSE_TEST_PROGRESS_SHARE) / 100))
                + ($testsPassed ? self::COURSE_TEST_PROGRESS_SHARE : 0);
        } else {
            $progress = $lessonPct;
        }

        $isComplete = ($totalLessons > 0 || $hasTests)
            && ($totalLessons === 0 || $completedLessons === $totalLessons)
            && $testsPassed;

        // Progresul fixat la publicarea unei versiuni noi (lockProgressBeforeNewVersion): conținutul
        // adăugat ulterior nu scade procentul, iar un curs terminat pe versiunea veche rămâne terminat.
        $floor = $row && isset($row->progress_floor) ? (int) $row->progress_floor : null;
        if ($floor !== null) {
            if ($floor >= 100) {
                $isComplete = true;
            } elseif (! $isComplete) {
                $progress = max($progress, (float) $floor);
            }
        }
        if ($isComplete) {
            $progress = 100.0;
        }

        $intPct = (int) round($progress, 0);
        $shouldBeCompleted = $isComplete;
        $hasCompletedAt = $row && ! empty($row->completed_at);
        $needsUpdate = $row && (
            (int) ($row->progress_percentage ?? 0) !== $intPct
            || ($shouldBeCompleted && ! $hasCompletedAt)
            || (! $shouldBeCompleted && $hasCompletedAt)
        );

        if ($needsUpdate) {
            $updateData = [
                'progress_percentage' => $intPct,
                'completed_at' => $shouldBeCompleted ? ($row->completed_at ?: Carbon::now()) : null,
                'updated_at' => Carbon::now(),
            ];
            DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->update($updateData);
        }

        return $this->courseProgressMemo[$memoKey] = round($progress, 2);
    }

    /**
     * Calculate module progress for a user
     */
    public function calculateModuleProgress(User $user, Module $module): float
    {
        if ($user->isLearningActivityExempt()) {
            return 0;
        }

        $lessonIds = $module->relationLoaded('lessons')
            ? $module->lessons->where('status', 'published')->pluck('id')
            : $module->lessons()->where('status', 'published')->pluck('id');
        if ($lessonIds->isEmpty()) {
            return 0;
        }

        $progressMap = $this->lessonProgressMap($user);
        $completed = $lessonIds->filter(
            fn ($id) => $this->progressRowIsComplete($progressMap[(int) $id] ?? null)
        )->count();
        $progress = ($completed / $lessonIds->count()) * 100;

        return round($progress, 2);
    }

    /**
     * Check if a module is unlocked for a user
     * Uses ProgressionEngine for rule-based evaluation
     */
    public function isModuleUnlocked(User $user, Module $module, Course $course): bool
    {
        return $this->progressionEngine->isModuleUnlocked($user, $module, $course);
    }

    /**
     * Check if a lesson is unlocked for a user
     * Uses ProgressionEngine for rule-based evaluation
     */
    public function isLessonUnlocked(User $user, Lesson $lesson, ?Module $module, Course $course): bool
    {
        return $this->progressionEngine->isLessonUnlocked($user, $lesson, $course);
    }

    /**
     * Check if a test is unlocked for a user
     * Uses ProgressionEngine for rule-based evaluation
     */
    public function isTestUnlocked(User $user, Test $test, Course $course): bool
    {
        return $this->progressionEngine->isTestUnlocked($user, $test, $course);
    }

    /**
     * Legacy exams table: access mirrors lesson/module progression (same idea as tests).
     */
    public function isExamUnlocked(User $user, Exam $exam, ?Module $module = null, ?Lesson $lesson = null): bool
    {
        // Examene fР вЂќРЎвЂњrР вЂќРЎвЂњ curs (catalog pe pagina Mape): published + vizibilitate elev
        if (empty($exam->course_id)) {
            if (($exam->status ?? 'draft') !== 'published') {
                return false;
            }

            return $exam->isVisibleToLearner($user);
        }

        $course = $exam->relationLoaded('course') && $exam->course
            ? $exam->course
            : Course::find($exam->course_id);

        if (!$course) {
            return false;
        }

        if ($lesson) {
            $lessonModule = $lesson->relationLoaded('module') && $lesson->module
                ? $lesson->module
                : ($module ?? ($lesson->module_id ? Module::find($lesson->module_id) : null));

            if (!$lessonModule) {
                return false;
            }

            return $this->isLessonUnlocked($user, $lesson, $lessonModule, $course);
        }

        if ($module) {
            return $this->isModuleUnlocked($user, $module, $course);
        }

        return true;
    }

    public function minimumAutoCompleteDwellSeconds(Lesson $lesson): int
    {
        $parts = [strip_tags((string) $lesson->content)];
        if ($lesson->relationLoaded('contentBlocks')) {
            foreach ($lesson->contentBlocks as $block) {
                $parts[] = strip_tags((string) ($block->source ?? ''));
            }
        }

        $text = trim(preg_replace('/\s+/u', ' ', implode(' ', $parts)) ?? '');
        preg_match_all('/\p{L}+/u', $text, $matches);
        $words = count($matches[0] ?? []);

        $hasMedia = in_array(strtolower((string) ($lesson->type ?? '')), ['video', 'pdf'], true)
            || filled($lesson->video_url);
        if ($lesson->relationLoaded('contentBlocks')) {
            foreach ($lesson->contentBlocks as $block) {
                if (in_array(strtolower((string) ($block->type ?? '')), ['video', 'pdf'], true)) {
                    $hasMedia = true;
                    break;
                }
            }
        }

        $seconds = max(4, (int) ceil($words / 4));
        if ($hasMedia) {
            $seconds = max($seconds, 12);
        }

        return min(180, $seconds);
    }

    /**
     * Mark lesson as completed
     */
    public function completeLesson(User $user, Lesson $lesson): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        $wrote = DB::transaction(function () use ($user, $lesson) {
            DB::table('lessons')->where('id', $lesson->id)->lockForUpdate()->first();

            $rows = DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('lesson_id', $lesson->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $allComplete = $rows->isNotEmpty() && $rows->every(
                fn ($row) => (bool) $row->completed && (int) $row->progress_percentage >= 100
            );
            if ($allComplete) {
                return false;
            }

            $now = Carbon::now();
            $payload = [
                'completed' => true,
                'progress_percentage' => 100,
                'completed_at' => $now,
                'updated_at' => $now,
            ];
            if ($rows->isEmpty()) {
                $payload['created_at'] = $now;
                try {
                    DB::table('lesson_progress')->insert(array_merge([
                        'user_id' => $user->id,
                        'lesson_id' => $lesson->id,
                    ], $payload));
                } catch (\Illuminate\Database\QueryException $e) {
                    $sqlState = (string) ($e->errorInfo[0] ?? '');
                    if (! in_array($sqlState, ['23000', '23505'], true)) {
                        throw $e;
                    }
                    DB::table('lesson_progress')
                        ->where('user_id', $user->id)
                        ->where('lesson_id', $lesson->id)
                        ->update($payload);
                }
            } else {
                DB::table('lesson_progress')
                    ->where('user_id', $user->id)
                    ->where('lesson_id', $lesson->id)
                    ->update($payload);
            }

            return true;
        });

        if (! $wrote) {
            return true;
        }

        $this->forgetUserProgressCache($user, $lesson->course_id ?? $lesson->module?->course_id);

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'completed_lesson',
            'model_type' => 'Lesson',
            'model_id' => $lesson->id,
            'description' => "{$user->name} a finalizat lecția \"{$lesson->title}\"",
            'new_values' => [
                'lesson_id' => $lesson->id,
                'lesson_title' => $lesson->title,
                'module_id' => $lesson->module_id,
                'course_id' => $lesson->course_id ?? $lesson->module?->course_id,
                'completed_at' => Carbon::now()->toDateTimeString(),
            ],
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
        ]);

        // Update lesson completion count
        $lesson->increment('completions_count');

        $course = $lesson->module?->course ?: $lesson->course;
        if ($course) {
            $this->syncStoredCourseCompletion($user, $course);
        }

        return true;
    }

    /**
     * Check if a module is complete (all lessons + required exams passed)
     */
    public function isModuleComplete(User $user, Module $module): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        $lessons = $module->lessons()->where('status', 'published')->get();
        
        if ($lessons->isEmpty()) {
            return false;
        }

        $passedIds = $this->passedTestIdSet($user, (int) $module->course_id);

        // Check if all lessons are completed
        foreach ($lessons as $lesson) {
            if (!$this->isLessonMarkedComplete($user, $lesson->id)) {
                return false;
            }
        }

        // Check if all lesson-level tests in this module are passed
        foreach ($lessons as $lesson) {
            $lessonTests = CourseTest::where('course_id', $module->course_id)
                ->where('scope', 'lesson')
                ->where('scope_id', $lesson->id)
                ->get();

            foreach ($lessonTests as $courseTest) {
                $test = $courseTest->test;
                if (!$test || $test->status !== 'published') {
                    continue;
                }

                $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

                if (!$hasPassed) {
                    return false;
                }
            }
        }

        // Check if all module-level tests are passed (cursul nu se finalizeazР вЂќРЎвЂњ fР вЂќРЎвЂњrР вЂќРЎвЂњ test)
        $moduleTests = CourseTest::where('course_id', $module->course_id)
            ->where('scope', 'module')
            ->where('scope_id', $module->id)
            ->get();

        foreach ($moduleTests as $courseTest) {
            $test = $courseTest->test;
            if (!$test || $test->status !== 'published') {
                continue;
            }

            $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

            if (!$hasPassed) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a course is complete (all modules + required exams passed)
     */
    public function isCourseComplete(User $user, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        if (SchemaCache::hasColumn('course_user', 'manually_completed')) {
            $forced = DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->value('manually_completed');
            if ($forced) {
                return true;
            }
        }

        if (SchemaCache::hasColumn('course_user', 'progress_floor')) {
            $floor = DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->value('progress_floor');
            if ($floor !== null && (int) $floor >= 100) {
                return true;
            }
        }

        $lessonIds = $this->requiredLessonIds($user, $course);

        $publishedTests = $this->requiredPublishedTests($user, $course);
        if ($lessonIds->isEmpty() && $publishedTests->isEmpty()) {
            return false;
        }

        foreach ($lessonIds as $lessonId) {
            if (! $this->isLessonMarkedComplete($user, (int) $lessonId)) {
                return false;
            }
        }

        return $this->allCourseTestsMeetCompletionThreshold($user, $course, $publishedTests);
    }

    private function syncStoredCourseCompletion(User $user, Course $course): void
    {
        $existing = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first();
        $wasCompleted = $existing && ! empty($existing->completed_at);

        $this->calculateCourseProgress($user, $course);

        if ($this->isCourseComplete($user, $course) && ! $wasCompleted) {
            if (StudentActivityLogger::logCompletedCourseIfFirst($user, $course)) {
                app(NotificationService::class)->notifyCourseCompleted($user, $course);
            }
        }
    }

    /**
     * Admin migration: mark a course completed for a learner without them retaking content.
     */
    public function markCourseCompletedByAdmin(User $user, Course $course): void
    {
        $lessonIds = Lesson::query()
            ->where('status', 'published')
            ->where(function ($query) use ($course) {
                $query->where(function ($root) use ($course) {
                    $root->where('course_id', $course->id)->whereNull('module_id');
                })->orWhereHas('module', function ($module) use ($course) {
                    $module->where('course_id', $course->id)->where('status', 'published');
                });
            })
            ->pluck('id');

        foreach ($lessonIds as $lessonId) {
            DB::table('lesson_progress')->updateOrInsert(
                [
                    'user_id' => $user->id,
                    'lesson_id' => $lessonId,
                ],
                [
                    'completed' => true,
                    'progress_percentage' => 100,
                    'completed_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                    'created_at' => Carbon::now(),
                ]
            );
        }

        foreach ($this->publishedAttachedTests($course) as $courseTest) {
            $testId = (int) ($courseTest->test_id ?? $courseTest->test?->id);
            if ($testId <= 0) {
                continue;
            }
            $existing = DB::table('test_results')
                ->where('user_id', $user->id)
                ->where('test_id', $testId)
                ->where('course_id', $course->id)
                ->orderByDesc('attempt_number')
                ->first();
            $payload = [
                'percentage' => self::COURSE_COMPLETION_TEST_PERCENT,
                'passed' => true,
                'status' => 'completed',
                'needs_manual_review' => false,
                'score' => self::COURSE_COMPLETION_TEST_PERCENT,
                'max_score' => 100,
                'completed_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ];
            if ($existing) {
                DB::table('test_results')->where('id', $existing->id)->update($payload);
            } else {
                DB::table('test_results')->insert(array_merge($payload, [
                    'user_id' => $user->id,
                    'test_id' => $testId,
                    'course_id' => $course->id,
                    'attempt_number' => 1,
                    'answers' => json_encode([]),
                    'created_at' => Carbon::now(),
                ]));
            }
        }

        $courseUser = [
            'enrolled' => true,
            'progress_percentage' => 100,
            'completed_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ];
        if (SchemaCache::hasColumn('course_user', 'manually_completed')) {
            $courseUser['manually_completed'] = true;
        }

        $exists = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->exists();
        if ($exists) {
            DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->update($courseUser);
        } else {
            DB::table('course_user')->insert(array_merge($courseUser, [
                'user_id' => $user->id,
                'course_id' => $course->id,
                'created_at' => Carbon::now(),
            ]));
        }

        $this->forgetUserProgressCache($user, $course->id);
    }

    /**
     * Cursanții văd snapshot-ul publicat cât timp adminul editează cursul.
     * Finalizarea folosește aceeași listă, nu lecțiile adăugate doar în ciornă.
     *
     * @return array{lessons: array<int, array>, modules: array<int, array>, test_ids: array<int, int>}|null
     */
    private function learnerPublishedOutline(User $user, Course $course): ?array
    {
        $key = $user->id . ':' . $course->id;
        if (array_key_exists($key, $this->learnerOutlineMemo)) {
            return $this->learnerOutlineMemo[$key];
        }

        if ($user->isLearningActivityExempt() || LearningVisibility::isStaff($user)) {
            return $this->learnerOutlineMemo[$key] = null;
        }
        if (($course->status ?? '') !== 'published' || ($course->workflow_status ?? 'published') !== 'editing') {
            return $this->learnerOutlineMemo[$key] = null;
        }

        $snapshot = app(PublishedCourseView::class)->latestPublishedSnapshot((int) $course->id);
        if (! is_array($snapshot)) {
            return $this->learnerOutlineMemo[$key] = null;
        }

        $lessons = collect($snapshot['lessons'] ?? [])
            ->filter(fn ($row) => is_array($row) && (int) ($row['id'] ?? 0) > 0)
            ->filter(fn ($row) => ($row['status'] ?? 'published') === 'published')
            ->values();
        $existingIds = Lesson::query()
            ->whereIn('id', $lessons->map(fn ($row) => (int) $row['id'])->all())
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $existing = array_fill_keys($existingIds, true);
        $lessons = $lessons
            ->filter(fn ($row) => isset($existing[(int) $row['id']]))
            ->values();

        $modules = collect($snapshot['modules'] ?? [])
            ->filter(fn ($row) => is_array($row) && (int) ($row['id'] ?? 0) > 0)
            ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']])
            ->values();

        $testIds = collect($snapshot['course_tests'] ?? [])
            ->filter(fn ($row) => is_array($row))
            ->map(fn ($row) => (int) ($row['test_id'] ?? 0))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $knownModules = array_fill_keys($modules->map(fn ($row) => (int) $row['id'])->all(), true);
        foreach ($lessons as $lesson) {
            $moduleId = (int) ($lesson['module_id'] ?? 0);
            if ($moduleId > 0 && ! isset($knownModules[$moduleId])) {
                $modules->push([
                    'id' => $moduleId,
                    'title' => '',
                    'order' => 9999,
                    'status' => 'published',
                ]);
                $knownModules[$moduleId] = true;
            }
        }

        return $this->learnerOutlineMemo[$key] = [
            'lessons' => $lessons->all(),
            'modules' => $modules->all(),
            'test_ids' => $testIds,
        ];
    }

    private function requiredLessonIds(User $user, Course $course)
    {
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline !== null) {
            return collect($outline['lessons'])->map(fn ($row) => (int) $row['id'])->values();
        }

        return Lesson::query()
            ->where('status', 'published')
            ->where(function ($query) use ($course) {
                $query->where(function ($root) use ($course) {
                    $root->where('course_id', $course->id)->whereNull('module_id');
                })->orWhereHas('module', function ($module) use ($course) {
                    $module->where('course_id', $course->id)->where('status', 'published');
                });
            })
            ->pluck('id');
    }

    private function requiredPublishedTests(User $user, Course $course)
    {
        $tests = $this->publishedAttachedTests($course);
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline === null) {
            return $tests;
        }

        $allowed = array_fill_keys($outline['test_ids'], true);

        return $tests
            ->filter(fn ($row) => isset($allowed[(int) $row->test_id]))
            ->values();
    }

    public function lessonIsOnPublishedSnapshot(User $user, Course $course, int $lessonId): bool
    {
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline === null) {
            return false;
        }

        foreach ($outline['lessons'] as $row) {
            if ((int) ($row['id'] ?? 0) === $lessonId) {
                return true;
            }
        }

        return false;
    }

    public function isLearnerLessonUnlocked(User $user, Lesson $lesson, Course $course): bool
    {
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline === null) {
            return $this->isLessonUnlocked($user, $lesson, $lesson->module, $course);
        }

        $row = collect($outline['lessons'])->first(fn ($item) => (int) ($item['id'] ?? 0) === (int) $lesson->id);
        if (! is_array($row)) {
            return $this->isLessonUnlocked($user, $lesson, $lesson->module, $course);
        }

        return $this->snapshotLessonUnlocked($user, $row, $outline, $course);
    }

    private function snapshotLessonUnlocked(User $user, array $lessonRow, array $outline, Course $course): bool
    {
        if (! empty($lessonRow['is_preview']) || ! $course->sequential_unlock) {
            return true;
        }

        $moduleId = $lessonRow['module_id'] ?? null;
        $siblings = collect($outline['lessons'])
            ->filter(function ($row) use ($moduleId) {
                $rowModule = $row['module_id'] ?? null;
                if ($moduleId) {
                    return (int) $rowModule === (int) $moduleId;
                }

                return empty($rowModule);
            })
            ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']])
            ->values();

        $previous = null;
        foreach ($siblings as $row) {
            if ((int) $row['id'] === (int) $lessonRow['id']) {
                break;
            }
            $previous = $row;
        }

        if ($previous) {
            return $this->isLessonMarkedComplete($user, (int) $previous['id']);
        }

        return $this->snapshotPreviousModuleComplete($user, $lessonRow, $outline, $course);
    }

    private function snapshotPreviousModuleComplete(User $user, array $lessonRow, array $outline, Course $course): bool
    {
        $moduleId = (int) ($lessonRow['module_id'] ?? 0);
        if ($moduleId === 0) {
            return true;
        }

        $previous = null;
        foreach (collect($outline['modules'])->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']]) as $module) {
            if ((int) $module['id'] === $moduleId) {
                break;
            }
            $previous = $module;
        }
        if (! $previous) {
            return true;
        }

        $previousLessons = collect($outline['lessons'])
            ->filter(fn ($row) => (int) ($row['module_id'] ?? 0) === (int) $previous['id']);
        foreach ($previousLessons as $row) {
            if (! $this->isLessonMarkedComplete($user, (int) $row['id'])) {
                return false;
            }
        }

        $allowedTests = array_fill_keys($outline['test_ids'], true);
        $moduleTests = CourseTest::where('course_id', $course->id)
            ->where('scope', 'module')
            ->where('scope_id', $previous['id'])
            ->with('test:id,status')
            ->get();
        foreach ($moduleTests as $courseTest) {
            if (! isset($allowedTests[(int) $courseTest->test_id])) {
                continue;
            }
            $test = $courseTest->test;
            if (! $test || $test->status !== 'published') {
                continue;
            }
            if (! $this->hasPassedCourseTestThreshold($user, (int) $test->id, (int) $course->id)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array{lessons: array<int, array>, modules: array<int, array>, test_ids: array<int, int>}  $outline
     * @return array<int, array>
     */
    private function orderedOutlineLessons(array $outline): array
    {
        $lessons = collect($outline['lessons']);
        $ordered = [];
        foreach ($lessons->filter(fn ($row) => empty($row['module_id']))->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']]) as $row) {
            $ordered[] = $row;
        }
        foreach (collect($outline['modules'])->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']]) as $module) {
            $moduleId = (int) $module['id'];
            $inModule = $lessons
                ->filter(fn ($row) => (int) ($row['module_id'] ?? 0) === $moduleId)
                ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']]);
            foreach ($inModule as $row) {
                $ordered[] = $row;
            }
        }

        return $ordered;
    }

    private function outlineModuleLessons(int $moduleId, array $outline)
    {
        $ids = collect($outline['lessons'])
            ->filter(fn ($row) => (int) ($row['module_id'] ?? 0) === $moduleId)
            ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']])
            ->map(fn ($row) => (int) $row['id'])
            ->values();
        if ($ids->isEmpty()) {
            return collect();
        }

        $byId = Lesson::query()->whereIn('id', $ids->all())->get()->keyBy(fn ($lesson) => (int) $lesson->id);

        return $ids->map(fn ($id) => $byId->get($id))->filter()->values();
    }

    private function outlineModuleProgress(User $user, int $moduleId, array $outline): float
    {
        $ids = collect($outline['lessons'])
            ->filter(fn ($row) => (int) ($row['module_id'] ?? 0) === $moduleId)
            ->map(fn ($row) => (int) $row['id'])
            ->values();
        if ($ids->isEmpty()) {
            return 0;
        }

        $progressMap = $this->lessonProgressMap($user);
        $completed = $ids->filter(
            fn ($id) => $this->progressRowIsComplete($progressMap[(int) $id] ?? null)
        )->count();

        return round(($completed / $ids->count()) * 100, 2);
    }

    private function snapshotModuleUnlocked(User $user, int $moduleId, array $outline, Course $course): bool
    {
        $first = collect($outline['lessons'])
            ->filter(fn ($row) => (int) ($row['module_id'] ?? 0) === $moduleId)
            ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']])
            ->first();
        if (is_array($first)) {
            return $this->snapshotLessonUnlocked($user, $first, $outline, $course);
        }

        return $this->snapshotPreviousModuleComplete($user, ['id' => 0, 'module_id' => $moduleId], $outline, $course);
    }

    private function publishedAttachedTests(Course $course)
    {
        return CourseTest::where('course_id', $course->id)
            ->whereHas('test', fn ($q) => $q->where('status', 'published'))
            ->with('test:id,status')
            ->get();
    }

    private function allCourseTestsMeetCompletionThreshold(User $user, Course $course, $publishedTests = null): bool
    {
        $publishedTests ??= $this->publishedAttachedTests($course);
        foreach ($publishedTests as $courseTest) {
            $testId = (int) ($courseTest->test_id ?? $courseTest->test?->id);
            if ($testId <= 0) {
                continue;
            }
            if (! $this->hasPassedCourseTestThreshold($user, $testId, (int) $course->id)) {
                return false;
            }
        }

        return true;
    }

    private function hasPassedCourseTestThreshold(User $user, int $testId, int $courseId): bool
    {
        $query = DB::table('test_results')
            ->where('user_id', $user->id)
            ->where('test_id', $testId)
            ->where('percentage', '>=', self::COURSE_COMPLETION_TEST_PERCENT)
            ->whereNotIn('status', ['in_progress', 'pending_review']);

        if (SchemaCache::hasColumn('test_results', 'needs_manual_review')) {
            $query->where(function ($q) {
                $q->whereNull('needs_manual_review')->orWhere('needs_manual_review', false);
            });
        }

        return $query->exists();
    }

    /**
     * Unified completion gate for a course.
     */
    public function canFinalizeCourse(User $user, Course $course): bool
    {
        return $this->isCourseComplete($user, $course);
    }

    /**
     * Get next incomplete lesson for a user in a course
     */
    public function getNextIncompleteLesson(User $user, Course $course): ?Lesson
    {
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline !== null) {
            foreach ($this->orderedOutlineLessons($outline) as $row) {
                if (! $this->snapshotLessonUnlocked($user, $row, $outline, $course)) {
                    continue;
                }
                if (! $this->isLessonMarkedComplete($user, (int) $row['id'])) {
                    return Lesson::find((int) $row['id']);
                }
            }

            return null;
        }

        $rootLessons = $this->getCourseRootLessons($course);
        foreach ($rootLessons as $lesson) {
            if (!$this->isLessonUnlocked($user, $lesson, null, $course)) {
                continue;
            }

            if (!$this->isLessonMarkedComplete($user, $lesson->id)) {
                return $lesson;
            }
        }

        $modules = $course->relationLoaded('modules')
            ? $course->modules->where('status', 'published')->sortBy('order')->values()
            : $course->modules()
                ->where('status', 'published')
                ->orderBy('order')
                ->get();

        foreach ($modules as $module) {
            // Check if module is unlocked
            if (!$this->isModuleUnlocked($user, $module, $course)) {
                continue;
            }

            $lessons = $module->relationLoaded('lessons')
                ? $module->lessons->where('status', 'published')->sortBy('order')->values()
                : $module->lessons()
                    ->where('status', 'published')
                    ->orderBy('order')
                    ->get();

            foreach ($lessons as $lesson) {
                // Check if lesson is unlocked
                if (!$this->isLessonUnlocked($user, $lesson, $module, $course)) {
                    continue;
                }

                // Check if lesson is completed
                if (!$this->isLessonMarkedComplete($user, $lesson->id)) {
                    return $lesson;
                }
            }
        }

        return null;
    }

    /**
     * Get next incomplete test for a user in a course
     * Order follows course flow: lesson tests (after each completed lesson), module tests, then course-level tests.
     */
    public function getNextIncompleteTest(User $user, Course $course): ?Test
    {
        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline !== null) {
            return $this->nextIncompleteOutlineTest($user, $course, $outline);
        }

        $passedIds = $this->passedTestIdSet($user, (int) $course->id);
        // Toate testele atașate cursului, o singură dată (cu testul), apoi filtrate în memorie:
        // înainte era câte o interogare pentru fiecare lecție și modul.
        $attachedTests = CourseTest::with('test')
            ->where('course_id', $course->id)
            ->orderBy('order')
            ->get();
        $testsFor = fn (string $scope, ?int $scopeId = null) => $attachedTests
            ->filter(fn (CourseTest $ct) => $ct->scope === $scope && ($scopeId === null || (int) $ct->scope_id === $scopeId))
            ->values();
        $rootLessons = $this->getCourseRootLessons($course);
        foreach ($rootLessons as $lesson) {
            if (!$this->isLessonUnlocked($user, $lesson, null, $course)) {
                continue;
            }

            if (!$this->isLessonMarkedComplete($user, $lesson->id)) {
                continue;
            }

            $lessonTests = $testsFor('lesson', (int) $lesson->id);

            foreach ($lessonTests as $courseTest) {
                $test = $courseTest->test;
                if (!$test || $test->status !== 'published') {
                    continue;
                }

                $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

                if (!$hasPassed && $this->isTestUnlocked($user, $test, $course)) {
                    return $test;
                }
            }
        }

        $modules = $course->modules()
            ->where('status', 'published')
            ->orderBy('order')
            ->get();

        foreach ($modules as $module) {
            if (!$this->isModuleUnlocked($user, $module, $course)) {
                continue;
            }

            $lessons = $module->lessons()
                ->where('status', 'published')
                ->orderBy('order')
                ->get();

            foreach ($lessons as $lesson) {
                if (!$this->isLessonUnlocked($user, $lesson, $module, $course)) {
                    continue;
                }

                $lessonCompleted = $this->isLessonMarkedComplete($user, $lesson->id);

                if (!$lessonCompleted) {
                    continue;
                }

                $lessonTests = $testsFor('lesson', (int) $lesson->id);

                foreach ($lessonTests as $courseTest) {
                    $test = $courseTest->test;
                    if (!$test || $test->status !== 'published') {
                        continue;
                    }

                    $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

                    if (!$hasPassed && $this->isTestUnlocked($user, $test, $course)) {
                        return $test;
                    }
                }
            }

            $moduleTests = $testsFor('module', (int) $module->id);

            foreach ($moduleTests as $courseTest) {
                $test = $courseTest->test;
                if (!$test || $test->status !== 'published') {
                    continue;
                }

                $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

                if (!$hasPassed && $this->isTestUnlocked($user, $test, $course)) {
                    return $test;
                }
            }
        }

        $courseTests = $testsFor('course');

        foreach ($courseTests as $courseTest) {
            $test = $courseTest->test;
            if (!$test || $test->status !== 'published') {
                continue;
            }

            $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

            if (!$hasPassed && $this->isTestUnlocked($user, $test, $course)) {
                return $test;
            }
        }

        return null;
    }

    /**
     * @param  array{lessons: array<int, array>, modules: array<int, array>, test_ids: array<int, int>}  $outline
     */
    private function nextIncompleteOutlineTest(User $user, Course $course, array $outline): ?Test
    {
        $passedIds = $this->passedTestIdSet($user, (int) $course->id);
        $allowedTests = array_fill_keys($outline['test_ids'], true);
        $pending = function (CourseTest $courseTest) use ($user, $course, $passedIds, $allowedTests): ?Test {
            if (! isset($allowedTests[(int) $courseTest->test_id])) {
                return null;
            }
            $test = $courseTest->test;
            if (! $test || $test->status !== 'published') {
                return null;
            }
            $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);
            if ($hasPassed) {
                return null;
            }

            return $test;
        };

        $currentModuleId = null;
        foreach ($this->orderedOutlineLessons($outline) as $row) {
            $moduleId = (int) ($row['module_id'] ?? 0);
            if ($currentModuleId !== null && $moduleId !== $currentModuleId) {
                $moduleTest = $this->firstPendingScopedTest($course, 'module', $currentModuleId, $pending);
                if ($moduleTest) {
                    return $moduleTest;
                }
            }
            $currentModuleId = $moduleId > 0 ? $moduleId : $currentModuleId;

            if (! $this->snapshotLessonUnlocked($user, $row, $outline, $course)) {
                continue;
            }
            if (! $this->isLessonMarkedComplete($user, (int) $row['id'])) {
                continue;
            }
            $lessonTest = $this->firstPendingScopedTest($course, 'lesson', (int) $row['id'], $pending);
            if ($lessonTest) {
                return $lessonTest;
            }
        }

        if ($currentModuleId) {
            $moduleTest = $this->firstPendingScopedTest($course, 'module', $currentModuleId, $pending);
            if ($moduleTest) {
                return $moduleTest;
            }
        }

        return $this->firstPendingScopedTest($course, 'course', null, $pending);
    }

    private function firstPendingScopedTest(Course $course, string $scope, ?int $scopeId, callable $pending): ?Test
    {
        $query = CourseTest::where('course_id', $course->id)
            ->where('scope', $scope)
            ->orderBy('order')
            ->with('test');
        if ($scope === 'course') {
            $query->whereNull('scope_id');
        } else {
            $query->where('scope_id', $scopeId);
        }

        foreach ($query->get() as $courseTest) {
            $test = $pending($courseTest);
            if ($test) {
                return $test;
            }
        }

        return null;
    }

    /**
     * Check if user can progress (all required tests passed)
     */
    public function canUserProgress(User $user, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        foreach ($this->requiredPublishedTests($user, $course) as $courseTest) {
            $test = $courseTest->test;
            if (!$test || $test->status !== 'published') {
                continue;
            }

            $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id);

            if (!$hasPassed) {
                return false;
            }
        }

        return true;
    }

    /**
     * Recalculate all progress for a course (after structure changes)
     */
    public function recalculateCourseProgress(Course $course): void
    {
        $enrolledUsers = DB::table('course_user')
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->pluck('user_id');

        foreach ($enrolledUsers as $userId) {
            $user = User::find($userId);
            if ($user) {
                $this->calculateCourseProgress($user, $course);
            }
        }
    }

    /**
     * Apelată la publicare, înainte ca versiunea nouă să devină vizibilă: fixează progresul fiecărui
     * cursant înscris, calculat pe versiunea pe care a învățat până acum (progress_floor).
     */
    public function lockProgressBeforeNewVersion(Course $course): void
    {
        if (! SchemaCache::hasColumn('course_user', 'progress_floor')) {
            return;
        }

        $rows = DB::table('course_user')
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->get(['user_id', 'progress_floor']);

        foreach (User::whereIn('id', $rows->pluck('user_id'))->get() as $user) {
            if ($user->isLearningActivityExempt()) {
                continue;
            }
            $complete = $this->isCourseComplete($user, $course);
            $current = $complete ? 100 : (int) round($this->calculateCourseProgress($user, $course));
            $previous = (int) ($rows->firstWhere('user_id', $user->id)->progress_floor ?? 0);
            $floor = max($previous, $current);
            if ($floor > 0) {
                DB::table('course_user')
                    ->where('user_id', $user->id)
                    ->where('course_id', $course->id)
                    ->update(['progress_floor' => $floor]);
            }
            $this->forgetUserProgressCache($user, $course->id);
        }
        $this->courseProgressMemo = [];
        $this->accessStatusMemo = [];
        $this->learnerOutlineMemo = [];
    }

    /**
     * Get user's access status for course elements
     */
    public function getUserAccessStatus(User $user, Course $course): array
    {
        $memoKey = $user->id . ':' . $course->id;
        if (isset($this->accessStatusMemo[$memoKey])) {
            return $this->accessStatusMemo[$memoKey];
        }

        $modules = $course->relationLoaded('modules')
            ? $course->modules->where('status', 'published')->sortBy('order')->values()
            : $course->modules()->where('status', 'published')->orderBy('order')->get();
        $rootLessons = $this->getCourseRootLessons($course);
        $progressMap = $this->lessonProgressMap($user);
        $accessStatus = [
            'course_progress' => $this->calculateCourseProgress($user, $course),
            'modules' => [],
            'root_lessons' => [],
            'course_level_tests' => [],
        ];

        $allCourseTests = CourseTest::where('course_id', $course->id)
            ->with(['test' => function ($q) {
                $q->select('id', 'title', 'status', 'type');
            }])
            ->orderBy('order')
            ->get();

        $outline = $this->learnerPublishedOutline($user, $course);
        if ($outline !== null) {
            $allowedTests = array_fill_keys($outline['test_ids'], true);
            $allCourseTests = $allCourseTests
                ->filter(fn ($row) => isset($allowedTests[(int) $row->test_id]))
                ->values();
        }

        $ctByKey = $allCourseTests->groupBy(function ($row) {
            $sid = $row->scope_id;

            return $row->scope . ':' . ($sid === null ? 'null' : (string) $sid);
        });

        $passedIds = $this->passedTestIdSet($user, (int) $course->id);
        $progressForCourseTest = function (CourseTest $courseTest) use ($user, $course, $passedIds): ?array {
            $test = $courseTest->test;
            if (!$test || $test->status !== 'published') {
                return null;
            }

            $hasPassed = $this->hasPassedTestResult($user, (int) $test->id, (int) $courseTest->course_id, $passedIds);

            return [
                'test_id' => $test->id,
                'passed' => $hasPassed,
                'unlocked' => $this->isTestUnlocked($user, $test, $course),
                'required' => true,
                'passing_score' => $courseTest->passing_score,
                'title' => $test->title,
            ];
        };

        if ($outline !== null) {
            $modules = collect($outline['modules'])->map(function ($row) use ($course) {
                $module = new Module();
                $module->forceFill([
                    'course_id' => $course->id,
                    'title' => $row['title'] ?? '',
                    'order' => $row['order'] ?? 0,
                    'status' => $row['status'] ?? 'published',
                ]);
                $module->id = (int) $row['id'];
                $module->exists = true;

                return $module;
            })->values();
            $rootIds = collect($outline['lessons'])
                ->filter(fn ($row) => empty($row['module_id']))
                ->sortBy(fn ($row) => [(int) ($row['order'] ?? 0), (int) $row['id']])
                ->map(fn ($row) => (int) $row['id'])
                ->values();
            $rootById = $rootIds->isEmpty()
                ? collect()
                : Lesson::query()->whereIn('id', $rootIds->all())->get()->keyBy(fn ($lesson) => (int) $lesson->id);
            $rootLessons = $rootIds->map(fn ($id) => $rootById->get($id))->filter()->values();
        }

        foreach ($modules as $module) {
            $moduleProgress = $outline !== null
                ? $this->outlineModuleProgress($user, (int) $module->id, $outline)
                : $this->calculateModuleProgress($user, $module);
            $isUnlocked = $outline !== null
                ? $this->snapshotModuleUnlocked($user, (int) $module->id, $outline, $course)
                : $this->isModuleUnlocked($user, $module, $course);

            $moduleData = [
                'id' => $module->id,
                'unlocked' => $isUnlocked,
                'progress' => $moduleProgress,
                'lessons' => [],
                'tests' => [],
            ];

            $moduleData['tests'] = $ctByKey->get('module:' . $module->id, collect())
                ->map($progressForCourseTest)
                ->filter()
                ->values()
                ->all();

            $lessons = $outline !== null
                ? $this->outlineModuleLessons((int) $module->id, $outline)
                : ($module->relationLoaded('lessons')
                    ? $module->lessons->where('status', 'published')->sortBy('order')->values()
                    : $module->lessons()->where('status', 'published')->orderBy('order')->get());
            foreach ($lessons as $lesson) {
                $isLessonUnlocked = $outline !== null
                    ? $this->isLearnerLessonUnlocked($user, $lesson, $course)
                    : $this->isLessonUnlocked($user, $lesson, $module, $course);
                
                $lessonProgress = $progressMap[(int) $lesson->id] ?? null;
                $progressPercentage = $lessonProgress->progress_percentage ?? 0;
                $isCompleted = $this->progressRowIsComplete($lessonProgress);

                $lessonTestsProgress = $ctByKey->get('lesson:' . $lesson->id, collect())
                    ->map($progressForCourseTest)
                    ->filter()
                    ->values()
                    ->all();

                $moduleData['lessons'][] = [
                    'id' => $lesson->id,
                    'unlocked' => $isLessonUnlocked,
                    'completed' => $isCompleted,
                    'progress_percentage' => $progressPercentage,
                    'is_preview' => $lesson->is_preview,
                    'tests' => $lessonTestsProgress,
                ];
            }

            $accessStatus['modules'][] = $moduleData;
        }

        $accessStatus['root_lessons'] = $rootLessons->map(function ($lesson) use ($user, $course, $ctByKey, $progressForCourseTest, $progressMap, $outline) {
            $lessonProgress = $progressMap[(int) $lesson->id] ?? null;
            $progressPercentage = $lessonProgress->progress_percentage ?? 0;

            return [
                'id' => $lesson->id,
                'unlocked' => $outline !== null
                    ? $this->isLearnerLessonUnlocked($user, $lesson, $course)
                    : $this->isLessonUnlocked($user, $lesson, null, $course),
                'completed' => ($lessonProgress->completed ?? false) || ($progressPercentage >= 100),
                'progress_percentage' => $progressPercentage,
                'is_preview' => $lesson->is_preview,
                'tests' => $ctByKey->get('lesson:' . $lesson->id, collect())
                    ->map($progressForCourseTest)
                    ->filter()
                    ->values()
                    ->all(),
            ];
        })->values()->all();

        $accessStatus['course_level_tests'] = $ctByKey->get('course:null', collect())
            ->map($progressForCourseTest)
            ->filter()
            ->values()
            ->all();

        return $this->accessStatusMemo[$memoKey] = $accessStatus;
    }
}

