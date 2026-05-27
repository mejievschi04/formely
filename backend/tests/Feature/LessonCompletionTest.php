<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
            ->assertJsonPath('completed', true)
            ->assertJsonPath('auto_completed', true);

        $row = DB::table('lesson_progress')
            ->where('user_id', $student->id)
            ->where('lesson_id', $lesson->id)
            ->first();

        $this->assertNotNull($row);
        $this->assertTrue((bool) $row->completed);

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
}
