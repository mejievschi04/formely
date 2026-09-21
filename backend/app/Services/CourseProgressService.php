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
use App\Models\Scopes\CompanyScope;
use App\Support\StudentActivityLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class CourseProgressService
{
    private const COURSE_COMPLETION_TEST_PERCENT = 80;

    private const COURSE_TEST_PROGRESS_SHARE = 10.0;

    protected ProgressionEngine $progressionEngine;

    protected DripContentService $dripContentService;

    public function __construct(ProgressionEngine $progressionEngine, DripContentService $dripContentService)
    {
        $this->progressionEngine = $progressionEngine;
        $this->dripContentService = $dripContentService;
    }

    protected function getCourseRootLessons(Course $course)
    {
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

        $lessonProgress = DB::table('lesson_progress')
            ->where('user_id', $user->id)
            ->where('lesson_id', $lessonId)
            ->first();

        if (!$lessonProgress) {
            return false;
        }

        return (bool) ($lessonProgress->completed ?? false) || (int) ($lessonProgress->progress_percentage ?? 0) >= 100;
    }
    /**
     * Calculate course progress for a user
     */
    public function calculateCourseProgress(User $user, Course $course): float
    {
        if ($user->isLearningActivityExempt()) {
            return 0;
        }

        $row = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->first();

        if ($row && Schema::hasColumn('course_user', 'manually_completed') && ($row->manually_completed ?? false)) {
            return 100.0;
        }

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
        $totalLessons = $lessonIds->count();
        $completedLessons = $lessonIds->filter(fn ($id) => $this->isLessonMarkedComplete($user, (int) $id))->count();

        $publishedTests = $this->publishedAttachedTests($course);
        $hasTests = $publishedTests->isNotEmpty();
        $testsPassed = ! $hasTests || $this->allCourseTestsMeetCompletionThreshold($user, $course, $publishedTests);

        if ($totalLessons === 0 && ! $hasTests) {
            return 0;
        }

        $lessonPct = $totalLessons === 0 ? 100.0 : ($completedLessons / $totalLessons) * 100;
        $progress = $hasTests
            ? ($lessonPct * ((100 - self::COURSE_TEST_PROGRESS_SHARE) / 100)) + ($testsPassed ? self::COURSE_TEST_PROGRESS_SHARE : 0)
            : $lessonPct;

        $isComplete = $this->isCourseComplete($user, $course);
        if ($isComplete) {
            $progress = 100.0;
        } elseif ($hasTests && ! $testsPassed) {
            $progress = min($progress, 99.0);
        }

        $intPct = (int) round($progress, 0);
        $shouldBeCompleted = $isComplete;
        $hasCompletedAt = $row && ! empty($row->completed_at);
        if ($row && (
            (int) ($row->progress_percentage ?? 0) !== $intPct
            || ($shouldBeCompleted && ! $hasCompletedAt)
            || (! $shouldBeCompleted && $hasCompletedAt)
        )) {
            DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->update([
                    'progress_percentage' => $intPct,
                    'completed_at' => $shouldBeCompleted ? ($row->completed_at ?: Carbon::now()) : null,
                    'updated_at' => Carbon::now(),
                ]);
        }

        return round($progress, 2);
    }

    /**
     * Calculate module progress for a user
     */
    public function calculateModuleProgress(User $user, Module $module): float
    {
        if ($user->isLearningActivityExempt()) {
            return 0;
        }

        $lessons = $module->lessons()->where('status', 'published')->get();
        
        if ($lessons->isEmpty()) {
            return 0;
        }

        $completed = 0;
        foreach ($lessons as $lesson) {
            // Check if lesson is completed (either marked as completed OR has 100% progress)
            $lessonProgress = DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('lesson_id', $lesson->id)
                ->first();
            
            $isCompleted = false;
            if ($lessonProgress) {
                $progressPercentage = $lessonProgress->progress_percentage ?? 0;
                // Lesson is completed if marked as completed OR has 100% progress
                $isCompleted = ($lessonProgress->completed ?? false) || ($progressPercentage >= 100);
            }

            if ($isCompleted) {
                $completed++;
            }
        }

        $progress = ($completed / $lessons->count()) * 100;
        
        // Update module calculated_progress if column exists
        if (DB::getSchemaBuilder()->hasColumn('modules', 'calculated_progress')) {
            // This is aggregate progress for all users, calculate separately if needed
        }

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

    /**
     * Mark lesson as completed
     */
    public function completeLesson(User $user, Lesson $lesson): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        // Check if already completed
        $existing = DB::table('lesson_progress')
            ->where('user_id', $user->id)
            ->where('lesson_id', $lesson->id)
            ->first();

        if ($existing && $existing->completed) {
            return true;
        }

        // Insert or update
        DB::table('lesson_progress')->updateOrInsert(
            [
                'user_id' => $user->id,
                'lesson_id' => $lesson->id,
            ],
            [
                'completed' => true,
                'progress_percentage' => 100,
                'completed_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
                'created_at' => $existing ? $existing->created_at : Carbon::now(),
            ]
        );

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

        // Check if all lessons are completed
        foreach ($lessons as $lesson) {
            $isCompleted = DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('lesson_id', $lesson->id)
                ->where('completed', true)
                ->exists();

            if (!$isCompleted) {
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

                $hasPassed = DB::table('test_results')
                    ->where('user_id', $user->id)
                    ->where('test_id', $test->id)
                    ->where('percentage', '>=', self::COURSE_COMPLETION_TEST_PERCENT)
                    ->where('passed', true)
                    ->exists();

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

            $hasPassed = DB::table('test_results')
                ->where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->where('percentage', '>=', self::COURSE_COMPLETION_TEST_PERCENT)
                ->where('passed', true)
                ->exists();

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

        if (Schema::hasColumn('course_user', 'manually_completed')) {
            $manual = DB::table('course_user')
                ->where('user_id', $user->id)
                ->where('course_id', $course->id)
                ->value('manually_completed');
            if ($manual) {
                return true;
            }
        }

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

        $publishedTests = $this->publishedAttachedTests($course);
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

    private function publishedAttachedTests(Course $course)
    {
        $rows = CourseTest::where('course_id', $course->id)->orderBy('order')->get();
        if ($rows->isEmpty()) {
            return $rows;
        }

        $tests = Test::query()
            ->withoutGlobalScope(CompanyScope::class)
            ->whereIn('id', $rows->pluck('test_id')->filter()->all())
            ->where('status', 'published')
            ->get(['id', 'title', 'status', 'type'])
            ->keyBy('id');

        return $rows->filter(function ($row) use ($tests) {
            $test = $tests->get((int) $row->test_id);
            if (! $test) {
                return false;
            }
            $row->setRelation('test', $test);

            return true;
        })->values();
    }

    /**
     * @param  array<int>  $courseIds
     * @return array<int, true>
     */
    public function courseIdsWithIncompletePublishedTests(User $user, array $courseIds): array
    {
        $courseIds = array_values(array_unique(array_map('intval', $courseIds)));
        if ($courseIds === [] || $user->isLearningActivityExempt()) {
            return [];
        }

        $rows = CourseTest::query()
            ->whereIn('course_id', $courseIds)
            ->get(['course_id', 'test_id']);
        if ($rows->isEmpty()) {
            return [];
        }

        $publishedIds = Test::query()
            ->withoutGlobalScope(CompanyScope::class)
            ->whereIn('id', $rows->pluck('test_id')->filter()->all())
            ->where('status', 'published')
            ->pluck('id')
            ->all();
        $publishedSet = array_fill_keys(array_map('intval', $publishedIds), true);

        $incomplete = [];
        foreach ($rows->groupBy('course_id') as $courseId => $courseRows) {
            foreach ($courseRows as $row) {
                $testId = (int) $row->test_id;
                if ($testId <= 0 || ! isset($publishedSet[$testId])) {
                    continue;
                }
                if (! $this->hasPassedCourseTestThreshold($user, $testId, (int) $courseId)) {
                    $incomplete[(int) $courseId] = true;
                    break;
                }
            }
        }

        return $incomplete;
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
            ->where(function ($q) use ($courseId) {
                $q->where('course_id', $courseId)->orWhereNull('course_id');
            })
            ->where('percentage', '>=', self::COURSE_COMPLETION_TEST_PERCENT)
            ->whereNotIn('status', ['in_progress', 'pending_review']);

        if (Schema::hasColumn('test_results', 'needs_manual_review')) {
            $query->where(function ($q) {
                $q->whereNull('needs_manual_review')->orWhere('needs_manual_review', false);
            });
        }

        return $query->exists();
    }

    /**
     * Legacy fallback: a course can also be finalized by passing its legacy exam.
     */
    public function hasPassedLegacyCourseExam(User $user, Course $course): bool
    {
        $exam = Exam::where('course_id', $course->id)
            ->where('status', 'published')
            ->first();

        if (!$exam) {
            return false;
        }

        return DB::table('exam_results')
            ->where('user_id', $user->id)
            ->where('exam_id', $exam->id)
            ->where('passed', true)
            ->exists();
    }

    /**
     * Unified completion gate for a course.
     */
    public function canFinalizeCourse(User $user, Course $course): bool
    {
        return $this->isCourseComplete($user, $course);
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

        $publishedTests = CourseTest::where('course_id', $course->id)
            ->whereHas('test', fn ($q) => $q->where('status', 'published'))
            ->with('test:id,status')
            ->get();

        foreach ($publishedTests as $courseTest) {
            $testId = (int) ($courseTest->test_id ?? $courseTest->test?->id);
            if ($testId <= 0) {
                continue;
            }
            $existing = DB::table('test_results')
                ->where('user_id', $user->id)
                ->where('test_id', $testId)
                ->where(function ($q) use ($course) {
                    $q->where('course_id', $course->id)->orWhereNull('course_id');
                })
                ->orderByDesc('attempt_number')
                ->first();
            $payload = [
                'percentage' => self::COURSE_COMPLETION_TEST_PERCENT,
                'passed' => true,
                'status' => 'completed',
                'score' => self::COURSE_COMPLETION_TEST_PERCENT,
                'max_score' => 100,
                'completed_at' => Carbon::now(),
                'updated_at' => Carbon::now(),
            ];
            if (Schema::hasColumn('test_results', 'needs_manual_review')) {
                $payload['needs_manual_review'] = false;
            }
            if ($existing) {
                DB::table('test_results')->where('id', $existing->id)->update($payload);
            } else {
                $insert = array_merge($payload, [
                    'user_id' => $user->id,
                    'test_id' => $testId,
                    'course_id' => $course->id,
                    'attempt_number' => 1,
                    'created_at' => Carbon::now(),
                ]);
                if (Schema::hasColumn('test_results', 'answers')) {
                    $insert['answers'] = json_encode([]);
                }
                DB::table('test_results')->insert($insert);
            }
        }

        $courseUser = [
            'enrolled' => true,
            'progress_percentage' => 100,
            'completed_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ];
        if (Schema::hasColumn('course_user', 'manually_completed')) {
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
    }

    /**
     * Get next incomplete lesson for a user in a course
     */
    public function getNextIncompleteLesson(User $user, Course $course): ?Lesson
    {
        $rootLessons = $this->getCourseRootLessons($course);
        foreach ($rootLessons as $lesson) {
            if (!$this->isLessonUnlocked($user, $lesson, null, $course)) {
                continue;
            }

            if (!$this->isLessonMarkedComplete($user, $lesson->id)) {
                return $lesson;
            }
        }

        $modules = $course->modules()
            ->where('status', 'published')
            ->orderBy('order')
            ->get();

        foreach ($modules as $module) {
            // Check if module is unlocked
            if (!$this->isModuleUnlocked($user, $module, $course)) {
                continue;
            }

            $lessons = $module->lessons()
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
        $published = $this->publishedAttachedTests($course);
        if ($published->isEmpty()) {
            return null;
        }

        $firstUnpassedUnlocked = function ($rows) use ($user, $course): ?Test {
            foreach ($rows as $courseTest) {
                $test = $courseTest->test;
                if (! $test) {
                    continue;
                }
                if ($this->hasPassedCourseTestThreshold($user, (int) $test->id, (int) $course->id)) {
                    continue;
                }
                if ($this->isTestUnlocked($user, $test, $course)) {
                    return $test;
                }
            }

            return null;
        };

        $byScope = $published->groupBy(function ($row) {
            $sid = $row->scope_id;

            return $row->scope . ':' . ($sid === null || $sid === '' ? 'null' : (string) $sid);
        });

        $rootLessons = $this->getCourseRootLessons($course);
        $allRootLessonsComplete = true;
        foreach ($rootLessons as $lesson) {
            if (! $this->isLessonUnlocked($user, $lesson, null, $course)) {
                $allRootLessonsComplete = false;
                continue;
            }

            if (! $this->isLessonMarkedComplete($user, $lesson->id)) {
                $allRootLessonsComplete = false;
                continue;
            }

            $found = $firstUnpassedUnlocked($byScope->get('lesson:' . $lesson->id, collect()));
            if ($found) {
                return $found;
            }
        }

        $modules = $course->modules()
            ->where('status', 'published')
            ->orderBy('order')
            ->get();

        $allCourseLessonsComplete = $allRootLessonsComplete;

        foreach ($modules as $module) {
            if (! $this->isModuleUnlocked($user, $module, $course)) {
                $allCourseLessonsComplete = false;
                continue;
            }

            $lessons = $module->lessons()
                ->where('status', 'published')
                ->orderBy('order')
                ->get();

            $allModuleLessonsComplete = true;
            foreach ($lessons as $lesson) {
                if (! $this->isLessonUnlocked($user, $lesson, $module, $course)) {
                    $allModuleLessonsComplete = false;
                    $allCourseLessonsComplete = false;
                    continue;
                }

                if (! $this->isLessonMarkedComplete($user, $lesson->id)) {
                    $allModuleLessonsComplete = false;
                    $allCourseLessonsComplete = false;
                    continue;
                }

                $found = $firstUnpassedUnlocked($byScope->get('lesson:' . $lesson->id, collect()));
                if ($found) {
                    return $found;
                }
            }

            if ($allModuleLessonsComplete) {
                $found = $firstUnpassedUnlocked($byScope->get('module:' . $module->id, collect()));
                if ($found) {
                    return $found;
                }
            }
        }

        if ($allCourseLessonsComplete) {
            $courseLevel = $published->filter(fn ($row) => $row->scope === 'course')->values();
            $found = $firstUnpassedUnlocked($courseLevel);
            if ($found) {
                return $found;
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

        foreach ($this->publishedAttachedTests($course) as $courseTest) {
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
     * Get user's access status for course elements
     */
    public function getUserAccessStatus(User $user, Course $course): array
    {
        $modules = $course->modules()->where('status', 'published')->orderBy('order')->get();
        $rootLessons = $this->getCourseRootLessons($course);
        $accessStatus = [
            'course_progress' => $this->calculateCourseProgress($user, $course),
            'modules' => [],
            'root_lessons' => [],
            'course_level_tests' => [],
        ];

        $allCourseTests = $this->publishedAttachedTests($course);

        $ctByKey = $allCourseTests->groupBy(function ($row) {
            $sid = $row->scope_id;

            return $row->scope . ':' . ($sid === null || $sid === '' ? 'null' : (string) $sid);
        });

        $progressForCourseTest = function (CourseTest $courseTest) use ($user, $course): ?array {
            $test = $courseTest->test;
            if (!$test || $test->status !== 'published') {
                return null;
            }

            $hasPassed = $this->hasPassedCourseTestThreshold($user, (int) $test->id, (int) $course->id);

            return [
                'test_id' => $test->id,
                'passed' => $hasPassed,
                'unlocked' => $this->isTestUnlocked($user, $test, $course),
                'required' => (bool) $courseTest->required,
                'passing_score' => $courseTest->passing_score,
                'title' => $test->title,
            ];
        };

        foreach ($modules as $module) {
            $moduleProgress = $this->calculateModuleProgress($user, $module);
            $isUnlocked = $this->isModuleUnlocked($user, $module, $course);

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

            $lessons = $module->lessons()->where('status', 'published')->orderBy('order')->get();
            foreach ($lessons as $lesson) {
                $isLessonUnlocked = $this->isLessonUnlocked($user, $lesson, $module, $course);
                
                // Check if lesson is completed (either marked as completed OR has 100% progress)
                $lessonProgress = DB::table('lesson_progress')
                    ->where('user_id', $user->id)
                    ->where('lesson_id', $lesson->id)
                    ->first();
                
                $isCompleted = false;
                $progressPercentage = 0;
                
                if ($lessonProgress) {
                    $progressPercentage = $lessonProgress->progress_percentage ?? 0;
                    // Lesson is completed if marked as completed OR has 100% progress
                    $isCompleted = ($lessonProgress->completed ?? false) || ($progressPercentage >= 100);
                }

                $lessonTestsProgress = $ctByKey->get('lesson:' . $lesson->id, collect())
                    ->map($progressForCourseTest)
                    ->filter()
                    ->values()
                    ->all();

                $dripUnlockAt = $this->dripContentService->getLessonUnlockAtForUser($user, $course, $lesson);

                $moduleData['lessons'][] = [
                    'id' => $lesson->id,
                    'unlocked' => $isLessonUnlocked,
                    'completed' => $isCompleted,
                    'progress_percentage' => $progressPercentage,
                    'is_preview' => $lesson->is_preview,
                    'drip_unlock_at' => $dripUnlockAt?->toIso8601String(),
                    'tests' => $lessonTestsProgress,
                ];
            }

            $accessStatus['modules'][] = $moduleData;
        }

        $accessStatus['root_lessons'] = $rootLessons->map(function ($lesson) use ($user, $course, $ctByKey, $progressForCourseTest) {
            $lessonProgress = DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('lesson_id', $lesson->id)
                ->first();

            $progressPercentage = $lessonProgress->progress_percentage ?? 0;
            $dripUnlockAt = $this->dripContentService->getLessonUnlockAtForUser($user, $course, $lesson);

            return [
                'id' => $lesson->id,
                'unlocked' => $this->isLessonUnlocked($user, $lesson, null, $course),
                'completed' => ($lessonProgress->completed ?? false) || ($progressPercentage >= 100),
                'progress_percentage' => $progressPercentage,
                'is_preview' => $lesson->is_preview,
                'drip_unlock_at' => $dripUnlockAt?->toIso8601String(),
                'tests' => $ctByKey->get('lesson:' . $lesson->id, collect())
                    ->map($progressForCourseTest)
                    ->filter()
                    ->values()
                    ->all(),
            ];
        })->values()->all();

        $accessStatus['course_level_tests'] = $allCourseTests
            ->filter(fn ($row) => $row->scope === 'course')
            ->map($progressForCourseTest)
            ->filter()
            ->values()
            ->all();

        return $accessStatus;
    }
}

