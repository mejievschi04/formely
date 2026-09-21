<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Runtime drip scheduling anchored on course_user.enrolled_at.
 */
class DripContentService
{
    /** @var array<int, array<int, int>> */
    protected array $lessonIndexCache = [];

    public function isEnabled(Course $course): bool
    {
        return (bool) $course->drip_content;
    }

    public function getEnrolledAt(User $user, Course $course): ?Carbon
    {
        $row = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->first(['enrolled_at']);

        if (! $row || empty($row->enrolled_at)) {
            return null;
        }

        return Carbon::parse($row->enrolled_at);
    }

    public function isLessonReleased(User $user, Course $course, Lesson $lesson): bool
    {
        if (! $this->isEnabled($course) || $user->isLearningActivityExempt()) {
            return true;
        }

        $enrolledAt = $this->getEnrolledAt($user, $course);
        if (! $enrolledAt) {
            return false;
        }

        return now()->greaterThanOrEqualTo($this->getLessonUnlockAt($course, $lesson, $enrolledAt));
    }

    public function isModuleReleased(User $user, Course $course, Module $module): bool
    {
        if (! $this->isEnabled($course) || $user->isLearningActivityExempt()) {
            return true;
        }

        $firstLesson = Lesson::query()
            ->where('module_id', $module->id)
            ->where('status', 'published')
            ->orderBy('order')
            ->first();

        if (! $firstLesson) {
            return true;
        }

        return $this->isLessonReleased($user, $course, $firstLesson);
    }

    public function getLessonUnlockAt(Course $course, Lesson $lesson, Carbon $enrolledAt): Carbon
    {
        $index = $this->getLessonDripIndex($course, $lesson);
        $offsetDays = $this->getOffsetDaysForIndex($course, $index);

        return $enrolledAt->copy()->startOfDay()->addDays($offsetDays);
    }

    public function getLessonUnlockAtForUser(User $user, Course $course, Lesson $lesson): ?Carbon
    {
        if (! $this->isEnabled($course)) {
            return null;
        }

        $enrolledAt = $this->getEnrolledAt($user, $course);
        if (! $enrolledAt) {
            return null;
        }

        return $this->getLessonUnlockAt($course, $lesson, $enrolledAt);
    }

    protected function getLessonDripIndex(Course $course, Lesson $lesson): int
    {
        $map = $this->buildLessonIndexMap($course);

        return $map[$lesson->id] ?? 0;
    }

    /**
     * @return array<int, int> lesson_id => drip index
     */
    protected function buildLessonIndexMap(Course $course): array
    {
        $courseId = (int) $course->id;
        if (isset($this->lessonIndexCache[$courseId])) {
            return $this->lessonIndexCache[$courseId];
        }

        $map = [];
        $index = 0;

        $modules = Module::query()
            ->where('course_id', $courseId)
            ->where('status', 'published')
            ->orderBy('order')
            ->get(['id']);

        foreach ($modules as $module) {
            $lessons = Lesson::query()
                ->where('module_id', $module->id)
                ->where('status', 'published')
                ->orderBy('order')
                ->get(['id']);

            foreach ($lessons as $lesson) {
                $map[(int) $lesson->id] = $index++;
            }
        }

        $rootLessons = Lesson::query()
            ->where('course_id', $courseId)
            ->whereNull('module_id')
            ->where('status', 'published')
            ->orderBy('order')
            ->get(['id']);

        foreach ($rootLessons as $lesson) {
            $map[(int) $lesson->id] = $index++;
        }

        return $this->lessonIndexCache[$courseId] = $map;
    }

    protected function getOffsetDaysForIndex(Course $course, int $index): int
    {
        $schedule = $this->parseSchedule($course);
        $offsets = $schedule['offsets_days'] ?? null;

        if (is_array($offsets) && array_key_exists($index, $offsets)) {
            return max(0, (int) $offsets[$index]);
        }

        $intervalDays = $this->getIntervalDays($schedule);

        return max(0, $index * $intervalDays);
    }

    /**
     * @return array<string, mixed>
     */
    protected function parseSchedule(Course $course): array
    {
        $raw = $course->drip_schedule;
        if (is_array($raw)) {
            return $raw;
        }

        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }

            return ['type' => strtolower(trim($raw))];
        }

        return ['type' => 'daily'];
    }

    /**
     * @param  array<string, mixed>  $schedule
     */
    protected function getIntervalDays(array $schedule): int
    {
        if (isset($schedule['interval_days']) && is_numeric($schedule['interval_days'])) {
            return max(1, (int) $schedule['interval_days']);
        }

        $type = strtolower((string) ($schedule['type'] ?? $schedule['schedule'] ?? 'daily'));

        return match ($type) {
            'weekly' => 7,
            'custom' => max(1, (int) ($schedule['interval_days'] ?? 1)),
            default => 1,
        };
    }
}
