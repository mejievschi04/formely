<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Services\CourseBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LessonCompletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_root_lesson_progress_at_100_triggers_full_completion(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();

        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție root',
                'content' => '<p>Test</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/progress", [
                'milestone_reached' => 100,
                'progress_percentage' => 100,
            ])
            ->assertOk()
            ->assertJsonPath('completed', false)
            ->assertJsonPath('auto_completed', false)
            ->assertJsonPath('awaiting_dwell', true);

        $this->travel(5)->seconds();

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/progress", [
                'milestone_reached' => 100,
                'progress_percentage' => 100,
            ])
            ->assertOk()
            ->assertJsonPath('completed', true)
            ->assertJsonPath('auto_completed', true);

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();

        $this->assertNotNull($row);
        $this->assertTrue((bool) $row->completed);
        $this->assertEquals(100, (int) $row->progress_percentage);

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/progress", [
                'milestone_reached' => 100,
                'progress_percentage' => 100,
            ])
            ->assertOk()
            ->assertJsonPath('completed', true)
            ->assertJsonPath('progress_percentage', 100);

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();
        $this->assertTrue((bool) $row->completed);
        $this->assertEquals(100, (int) $row->progress_percentage);

        $this->assertTrue(
            DB::table('activity_logs')
                ->where('user_id', $student->id)
                ->where('action', 'completed_lesson')
                ->where('model_id', $lesson->id)
                ->exists()
        );
    }

    public function test_complete_lesson_endpoint_returns_flattened_lessons(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();

        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție',
                'content' => '<p>x</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($student, 'sanctum')
            ->postJson("/api/lessons/{$lesson->id}/complete")
            ->assertOk();

        $lessons = $response->json('progress.lessons');
        $this->assertIsArray($lessons);
        $match = collect($lessons)->firstWhere('lesson_id', $lesson->id);
        $this->assertNotNull($match);
        $this->assertTrue($match['completed']);
    }

    public function test_time_heartbeat_cannot_undo_explicit_completion(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();

        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție',
                'content' => '<p>Text destul de lung pentru dwell.</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $lesson->id,
            'completed' => false,
            'progress_percentage' => 40,
            'time_spent_seconds' => 5,
            'started_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/lessons/{$lesson->id}/complete")
            ->assertOk()
            ->assertJsonPath('progress.lessons.0.completed', true);

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/progress", [
                'add_time_spent_seconds' => 3,
            ])
            ->assertOk()
            ->assertJsonPath('completed', true)
            ->assertJsonPath('progress_percentage', 100);

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();

        $this->assertTrue((bool) $row->completed);
        $this->assertEquals(100, (int) $row->progress_percentage);

        $controller = app(\App\Http\Controllers\Api\CourseProgressController::class);
        $write = new \ReflectionMethod($controller, 'writeLessonProgressWithoutClearingCompletion');
        $stale = (object) [
            'id' => $row->id,
            'completed' => 0,
            'progress_percentage' => 40,
            'completed_at' => null,
        ];
        $write->invoke($controller, $student->id, $lesson->id, $stale, [
            'progress_percentage' => 40,
            'time_spent_seconds' => 9,
            'completed' => false,
            'completed_at' => null,
            'started_at' => now(),
            'updated_at' => now(),
            'created_at' => now(),
        ]);

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();
        $this->assertTrue((bool) $row->completed);
        $this->assertEquals(100, (int) $row->progress_percentage);
    }

    public function test_progress_read_prefers_completed_row_when_duplicates_exist(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();

        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție',
                'content' => '<p>x</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::table('lesson_progress', function ($table) {
            $table->dropUnique(['user_id', 'lesson_id']);
        });

        DB::table('lesson_progress')->insert([
            [
                'user_id' => $student->id,
                'lesson_id' => $lesson->id,
                'completed' => true,
                'progress_percentage' => 100,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $student->id,
                'lesson_id' => $lesson->id,
                'completed' => false,
                'progress_percentage' => 10,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}/progress")
            ->assertOk()
            ->assertJsonPath('lessons.0.completed', true)
            ->assertJsonPath('lessons.0.progress_percentage', 100);
    }

    public function test_student_can_complete_lesson_after_published_content_is_edited(): void
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
            'content' => '<p>Conținutul primit de cursant</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));
        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(CourseBuilderService::class)->createCourseVersionSnapshot($course->id, null, 'published');
        $course->forceFill(['workflow_status' => 'editing'])->save();

        Lesson::withoutEvents(function () use ($lesson) {
            $lesson->update([
                'title' => 'Titlu schimbat în editor',
                'content' => '<p>Conținut nou, încă nepublicat</p>',
                'status' => 'draft',
            ]);
        });
        Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => null,
            'title' => 'Lecție adăugată doar în editor',
            'content' => '<p>Nu trebuie să blocheze trecerea</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
        ]));

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('title', 'Lecția publicată')
            ->assertJsonPath('content', '<p>Conținutul primit de cursant</p>');

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/lessons/{$lesson->id}/complete")
            ->assertOk()
            ->assertJsonPath('progress.lessons.0.completed', true);

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/progress", [
                'add_time_spent_seconds' => 4,
            ])
            ->assertOk()
            ->assertJsonPath('completed', true)
            ->assertJsonPath('progress_percentage', 100);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}/progress")
            ->assertOk()
            ->assertJsonPath('lessons.0.lesson_id', $lesson->id)
            ->assertJsonPath('lessons.0.completed', true)
            ->assertJsonPath('lessons.0.progress_percentage', 100)
            ->assertJsonCount(1, 'lessons');

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();
        $this->assertNotNull($row);
        $this->assertTrue((bool) $row->completed);
        $this->assertEquals(100, (int) $row->progress_percentage);
    }
}
