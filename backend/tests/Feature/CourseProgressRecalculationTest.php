<?php

namespace Tests\Feature;

use App\Jobs\RecalculateCourseProgressJob;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CourseProgressRecalculationTest extends TestCase
{
    use RefreshDatabase;

    private function makeLesson(Course $course, int $order): Lesson
    {
        return Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => null,
            'title' => "Lecția {$order}",
            'content' => '<p>Conținut</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => $order,
        ]));
    }

    public function test_repeated_lesson_saves_queue_a_single_recalculation_per_course(): void
    {
        $course = Course::factory()->published()->create();
        $lesson = $this->makeLesson($course, 1);

        Queue::fake();

        $lesson->update(['title' => 'Salvare 1']);
        $lesson->update(['title' => 'Salvare 2']);
        $lesson->update(['title' => 'Salvare 3']);

        Queue::assertPushed(RecalculateCourseProgressJob::class, 1);
        Queue::assertPushed(
            RecalculateCourseProgressJob::class,
            fn (RecalculateCourseProgressJob $job) => $job->courseId === $course->id
        );
    }

    public function test_job_updates_enrolled_students_progress(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();
        $first = $this->makeLesson($course, 1);
        $this->makeLesson($course, 2);

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'progress_percentage' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $first->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        (new RecalculateCourseProgressJob($course->id))->handle(app(\App\Services\CourseProgressService::class));

        $this->assertSame(
            50,
            (int) DB::table('course_user')->where('user_id', $student->id)->where('course_id', $course->id)->value('progress_percentage')
        );
    }
}
