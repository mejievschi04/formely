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
                $hasPassed = $this->hasUserPassedTest($user, $previousTest->test_id, $courseTest->passing_score);
                if (!$hasPassed) {
                    return false;
                }
            }
        }

        if ($courseTest->unlock_after_test_id) {
            $hasPassed = $this->hasUserPassedTest($user, $courseTest->unlock_after_test_id, $courseTest->passing_score);
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

        $previousLesson = Lesson::where('module_id', $lesson->module_id)
            ->where('order', '<', $lesson->order)
            ->whereIn('status', ['published', 'draft'])
            ->orderBy('order', 'desc')
            ->first();

        if ($previousLesson) {
            return DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('lesson_id', $previousLesson->id)
                ->where('completed', true)
                ->exists();
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

        $previousModule = Module::where('course_id', $course->id)
            ->where('order', '<', $module->order)
            ->whereIn('status', ['published', 'draft'])
            ->orderBy('order', 'desc')
            ->first();

        if ($previousModule) {
            $lessons = $previousModule->lessons()->whereIn('status', ['published', 'draft'])->get();
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

            $requiredTests = CourseTest::where('course_id', $course->id)
                ->where('scope', 'module')
                ->where('scope_id', $previousModule->id)
                ->where('required', true)
                ->get();
            foreach ($requiredTests as $courseTest) {
                $test = $courseTest->test;
                if ($test && $test->status === 'published') {
                    $hasPassed = DB::table('test_results')
                        ->where('user_id', $user->id)
                        ->where('test_id', $test->id)
                        ->where('percentage', '>=', $courseTest->passing_score)
                        ->where('passed', true)
                        ->exists();
                    if (!$hasPassed) {
                        return false;
                    }
                }
            }

            return true;
        }

        return true;
    }

    protected function hasUserPassedTest(User $user, int $testId, int $passingScore = 70): bool
    {
        return DB::table('test_results')
            ->where('user_id', $user->id)
            ->where('test_id', $testId)
            ->where('percentage', '>=', $passingScore)
            ->where('passed', true)
            ->exists();
    }
}
