<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CourseEndTestProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_unfinished_end_of_course_test_blocks_100_percent_and_is_next_exam(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Ultima lecție',
                'content' => '<p>x</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });
        $test = Test::factory()->published()->create(['type' => 'final']);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

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

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/lessons/{$lesson->id}/complete")
            ->assertOk();

        $progress = $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}/progress")
            ->assertOk()
            ->json();

        $this->assertLessThan(100, (float) $progress['progress_percentage']);
        $this->assertFalse($progress['course_complete']);
        $this->assertSame($test->id, $progress['next_exam']['id'] ?? null);

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/courses/{$course->id}/finish")
            ->assertStatus(409)
            ->assertJsonPath('next_test_id', $test->id);

        $row = DB::table('course_user')
            ->where('user_id', $student->id)
            ->where('course_id', $course->id)
            ->first();

        $this->assertLessThan(100, (int) $row->progress_percentage);
        $this->assertNull($row->completed_at);
    }
}
