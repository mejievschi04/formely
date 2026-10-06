<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Test;
use App\Models\User;
use App\Models\CourseTest;
use Illuminate\Support\Facades\DB;

/**
 * Evaluates lesson/module/test unlock (sequential unlock, preview, course_test links).
 */
class ProgressionEngine
{
    /**
     * Memorie pe durata cererii, ca deblocarea fiecărei lecții să nu mai facă query-uri proprii.
     * Structura cursului nu se schimbă într-o cerere de cursant; progresul cursantului se golește
     * prin forgetUser() (apelat de CourseProgressService când marchează o lecție).
     */
    /** @var array<string, \Illuminate\Support\Collection> lecții publicate pe scop (curs sau modul) */
    private array $publishedLessonsByScope = [];

    /** @var array<int, \Illuminate\Support\Collection> module pe curs */
    private array $modulesByCourse = [];

    /** @var array<int, \Illuminate\Support\Collection> teste obligatorii la nivel de modul, pe curs */
    private array $requiredModuleTestsByCourse = [];

    /** @var array<int, array<int, true>> lecții terminate, pe cursant */
    private array $completedLessonsByUser = [];

    public function forgetUser(int $userId): void
    {
        unset($this->completedLessonsByUser[$userId]);
    }

    public function isLessonUnlocked(User $user, Lesson $lesson, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        if ($lesson->is_preview) {
            return true;
        }

        return $this->checkSequentialUnlock($user, $lesson, $course);
    }

    public function isModuleUnlocked(User $user, Module $module, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        if ($module->is_locked) {
            return $this->checkSequentialModuleUnlock($user, $module, $course);
        }

        return $this->checkSequentialModuleUnlock($user, $module, $course);
    }

    public function isTestUnlocked(User $user, Test $test, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        $courseTest = CourseTest::where('course_id', $course->id)
            ->where('test_id', $test->id)
            ->first();

        if (!$courseTest) {
            return false;
        }

        if ($courseTest->unlock_after_previous) {
            $previousTest = CourseTest::where('course_id', $course->id)
                ->where('scope', $courseTest->scope)
                ->where('scope_id', $courseTest->scope_id)
                ->where('order', '<', $courseTest->order)
                ->orderBy('order', 'desc')
                ->first();

            if ($previousTest) {
                $hasPassed = $this->hasUserPassedTest(
                    $user,
                    (int) $previousTest->test_id,
                    (int) ($previousTest->passing_score ?? 70),
                    (int) $course->id
                );
                if (!$hasPassed) {
                    return false;
                }
            }
        }

        if ($courseTest->unlock_after_test_id) {
            $prerequisite = CourseTest::where('course_id', $course->id)
                ->where('test_id', $courseTest->unlock_after_test_id)
                ->first();
            $hasPassed = $this->hasUserPassedTest(
                $user,
                (int) $courseTest->unlock_after_test_id,
                (int) ($prerequisite->passing_score ?? $courseTest->passing_score ?? 70),
                (int) $course->id
            );
            if (!$hasPassed) {
                return false;
            }
        }

        if ($courseTest->scope === 'lesson') {
            $lesson = Lesson::find($courseTest->scope_id);
            if ($lesson) {
                return $this->isLessonUnlocked($user, $lesson, $course);
            }
        } elseif ($courseTest->scope === 'module') {
            $module = Module::find($courseTest->scope_id);
            if ($module) {
                return $this->isModuleUnlocked($user, $module, $course);
            }
        }

        return true;
    }

    protected function checkSequentialUnlock(User $user, Lesson $lesson, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        if (!$course->sequential_unlock) {
            return true;
        }

        // Lecția publicată imediat anterioară în același modul (sau printre lecțiile fără modul ale cursului)
        $order = (int) ($lesson->order ?? 0);
        $previousLesson = $this->publishedLessonsInScope($lesson->module_id ? (int) $lesson->module_id : null, (int) $course->id)
            ->filter(fn ($row) => (int) $row->id !== (int) $lesson->id && $row->order !== null && (int) $row->order < $order)
            ->sortBy([['order', 'desc'], ['id', 'desc']])
            ->first();

        if ($previousLesson) {
            return $this->userHasCompletedLesson($user, (int) $previousLesson->id);
        }

        return true;
    }

    protected function checkSequentialModuleUnlock(User $user, Module $module, Course $course): bool
    {
        if ($user->isLearningActivityExempt()) {
            return true;
        }

        if (!$course->sequential_unlock) {
            return true;
        }

        $previousModule = $this->modulesForCourse((int) $course->id)
            ->filter(fn ($row) => $row->order !== null && $module->order !== null && (int) $row->order < (int) $module->order)
            ->sortByDesc('order')
            ->first();

        if ($previousModule) {
            foreach ($this->publishedLessonsInScope((int) $previousModule->id, (int) $course->id) as $lesson) {
                if (! $this->userHasCompletedLesson($user, (int) $lesson->id)) {
                    return false;
                }
            }

            $requiredTests = $this->requiredModuleTestsForCourse((int) $course->id)
                ->where('scope_id', (int) $previousModule->id);
            foreach ($requiredTests as $courseTest) {
                $test = $courseTest->test;
                if ($test && $test->status === 'published') {
                    $hasPassed = $this->hasUserPassedTest(
                        $user,
                        (int) $test->id,
                        (int) ($courseTest->passing_score ?? 70),
                        (int) $course->id
                    );
                    if (!$hasPassed) {
                        return false;
                    }
                }
            }

            return true;
        }

        return true;
    }

    protected function userHasCompletedLesson(User $user, int $lessonId): bool
    {
        $userId = (int) $user->id;
        if (! isset($this->completedLessonsByUser[$userId])) {
            $completed = [];
            $rows = DB::table('lesson_progress')
                ->where('user_id', $userId)
                ->where(fn ($q) => $q->where('completed', true)->orWhere('progress_percentage', '>=', 100))
                ->pluck('lesson_id');
            foreach ($rows as $id) {
                $completed[(int) $id] = true;
            }
            $this->completedLessonsByUser[$userId] = $completed;
        }

        return isset($this->completedLessonsByUser[$userId][$lessonId]);
    }

    /**
     * Lecțiile publicate dintr-un modul sau, fără modul, cele de la rădăcina cursului.
     */
    private function publishedLessonsInScope(?int $moduleId, int $courseId)
    {
        $key = $moduleId ? "m{$moduleId}" : "c{$courseId}";
        if (isset($this->publishedLessonsByScope[$key])) {
            return $this->publishedLessonsByScope[$key];
        }

        // O singură interogare pentru tot cursul (lecțiile din modulele lui + cele fără modul), apoi pe
        // module în memorie: înainte era câte o interogare pentru fiecare modul.
        $moduleIds = $this->modulesForCourse($courseId)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (! $moduleId || in_array($moduleId, $moduleIds, true)) {
            $lessons = Lesson::query()
                ->where('status', 'published')
                ->where(function ($q) use ($courseId, $moduleIds) {
                    $q->where(fn ($root) => $root->whereNull('module_id')->where('course_id', $courseId));
                    if ($moduleIds !== []) {
                        $q->orWhereIn('module_id', $moduleIds);
                    }
                })
                ->get(['id', 'order', 'module_id']);

            $this->publishedLessonsByScope["c{$courseId}"] = $lessons->whereNull('module_id')->values();
            foreach ($moduleIds as $id) {
                $this->publishedLessonsByScope["m{$id}"] = $lessons->where('module_id', $id)->values();
            }
        }

        // Modul care nu aparține cursului (date inconsecvente): îl încărcăm separat, ca înainte.
        return $this->publishedLessonsByScope[$key] ??= Lesson::query()
            ->where('status', 'published')
            ->where('module_id', $moduleId)
            ->get(['id', 'order', 'module_id']);
    }

    private function modulesForCourse(int $courseId)
    {
        return $this->modulesByCourse[$courseId] ??= Module::query()
            ->where('course_id', $courseId)
            ->whereIn('status', ['published', 'draft'])
            ->get(['id', 'order']);
    }

    private function requiredModuleTestsForCourse(int $courseId)
    {
        return $this->requiredModuleTestsByCourse[$courseId] ??= CourseTest::query()
            ->with('test:id,status')
            ->where('course_id', $courseId)
            ->where('scope', 'module')
            ->where('required', true)
            ->get();
    }

    protected function hasUserPassedTest(User $user, int $testId, int $passingScore = 70, ?int $courseId = null): bool
    {
        return DB::table('test_results')
            ->where('user_id', $user->id)
            ->where('test_id', $testId)
            ->where('passed', true)
            ->exists();
    }
}
