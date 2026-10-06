<?php
namespace Tests\Feature;

use App\Models\{Course, CourseTest, Lesson, Test, TestResult, User};
use App\Services\{CourseBuilderService, CourseProgressService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RequiredCourseTestsTest extends TestCase
{
    use RefreshDatabase;

    public function test_all_attached_tests_must_be_passed_even_if_previously_optional(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Lesson',
            'content' => 'Content', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id, 'lesson_id' => $lesson->id,
            'completed' => true, 'progress_percentage' => 100,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $service = app(CourseProgressService::class);
        $this->assertTrue($service->isCourseComplete($student, $course));
        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id, 'test_id' => $test->id,
            'scope' => 'course', 'required' => false, 'passing_score' => 70, 'order' => 0,
        ]);
        $this->assertFalse($service->isCourseComplete($student, $course));
        $result = TestResult::create([
            'test_id' => $test->id, 'course_id' => $course->id, 'user_id' => $student->id,
            'score' => 40, 'max_score' => 100, 'percentage' => 40, 'passed' => false,
            'attempt_number' => 1, 'answers' => [], 'completed_at' => now(), 'status' => 'completed',
        ]);
        $this->assertFalse($service->isCourseComplete($student, $course));
        $result->update(['score' => 80, 'percentage' => 80, 'passed' => true]);
        $this->assertTrue($service->isCourseComplete($student, $course));
    }

    public function test_passed_flag_below_80_percent_does_not_complete_the_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Lesson',
            'content' => 'Content', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id, 'lesson_id' => $lesson->id,
            'completed' => true, 'progress_percentage' => 100,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id, 'test_id' => $test->id,
            'scope' => 'course', 'required' => false, 'passing_score' => 50, 'order' => 0,
        ]);
        TestResult::create([
            'test_id' => $test->id, 'course_id' => $course->id, 'user_id' => $student->id,
            'score' => 70, 'max_score' => 100, 'percentage' => 70, 'passed' => true,
            'attempt_number' => 1, 'answers' => [], 'completed_at' => now(), 'status' => 'completed',
        ]);
        $service = app(CourseProgressService::class);
        $this->assertFalse($service->isCourseComplete($student, $course));
        $this->assertLessThan(100, $service->calculateCourseProgress($student, $course));
    }

    public function test_stale_completed_at_is_cleared_when_tests_are_not_passed(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Lesson',
            'content' => 'Content', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id, 'lesson_id' => $lesson->id,
            'completed' => true, 'progress_percentage' => 100,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id, 'test_id' => $test->id,
            'scope' => 'course', 'required' => true, 'passing_score' => 70, 'order' => 0,
        ]);
        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'progress_percentage' => 100,
            'completed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $service = app(CourseProgressService::class);
        $service->calculateCourseProgress($student, $course);

        $this->assertNull(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->value('completed_at')
        );
        $this->assertLessThan(
            100,
            (int) DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->value('progress_percentage')
        );
    }

    public function test_attachment_can_remain_optional(): void
    {
        $link = app(CourseBuilderService::class)->attachTest(
            Course::factory()->published()->create(), Test::factory()->published()->create(), ['required' => false]
        );
        $this->assertFalse($link->required);
    }

    public function test_a_pass_from_another_course_completes_this_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $otherCourse = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Lesson',
            'content' => 'Content', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id, 'lesson_id' => $lesson->id,
            'completed' => true, 'progress_percentage' => 100,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id, 'test_id' => $test->id,
            'scope' => 'course', 'required' => true, 'passing_score' => 70, 'order' => 0,
        ]);
        TestResult::create([
            'test_id' => $test->id, 'course_id' => $otherCourse->id, 'user_id' => $student->id,
            'score' => 80, 'max_score' => 100, 'percentage' => 80, 'passed' => true,
            'attempt_number' => 1, 'answers' => [], 'completed_at' => now(), 'status' => 'completed',
        ]);

        $this->assertTrue(app(CourseProgressService::class)->isCourseComplete($student, $course));
    }

    public function test_admin_edits_after_publish_do_not_uncomplete_the_version_learners_received(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create([
            'workflow_status' => 'published',
            'sequential_unlock' => false,
        ]);
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => null,
            'title' => 'Lecția publicată',
            'content' => '<p>Conținut</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));
        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'progress_percentage' => 100,
            'completed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $lesson->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(CourseBuilderService::class)->createCourseVersionSnapshot($course->id, null, 'published');
        $course->forceFill(['workflow_status' => 'editing'])->save();

        Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => null,
            'title' => 'Lecție adăugată după',
            'content' => '<p>Nou</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
        ]));
        $lesson->update(['status' => 'draft', 'title' => 'Titlu schimbat în editor']);

        $course = $course->fresh();
        $service = app(CourseProgressService::class);
        $this->assertTrue($service->isCourseComplete($student, $course));
        $this->assertSame(100.0, $service->calculateCourseProgress($student, $course));
        $this->assertNotNull(
            DB::table('course_user')->where('user_id', $student->id)->where('course_id', $course->id)->value('completed_at')
        );

        $status = $service->getUserAccessStatus($student, $course);
        $shown = collect($status['root_lessons'])->firstWhere('id', $lesson->id);
        $this->assertNotNull($shown);
        $this->assertTrue($shown['completed']);
        $this->assertCount(1, $status['root_lessons']);

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/lessons/{$lesson->id}/complete")
            ->assertOk();

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/courses/{$course->id}/finish")
            ->assertOk();
    }
}
