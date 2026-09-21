<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestTimeLimitSubmitTest extends TestCase
{
    use RefreshDatabase;

    public function test_timed_test_submit_without_started_at_is_rejected(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = $this->createTimedTest($owner);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $response = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('time_limit_required', true);
    }

    public function test_timed_test_submit_after_deadline_is_rejected(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = $this->createTimedTest($owner);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $startedAt = now()->subMinutes(10)->toIso8601String();

        $response = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'started_at' => $startedAt,
            'answers' => [],
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('time_limit_expired', true);
    }

    public function test_timed_test_submit_within_limit_succeeds(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = $this->createTimedTest($owner);

        $question = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'points' => 10,
            'answers' => [
                ['text' => 'Da', 'is_correct' => true],
                ['text' => 'Nu', 'is_correct' => false],
            ],
        ]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $response = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'started_at' => now()->subMinute()->toIso8601String(),
            'answers' => [
                (string) $question->id => 0,
            ],
        ]);

        $response->assertOk()
            ->assertJsonStructure(['result' => ['percentage', 'passed']]);
    }

    public function test_untimed_test_submit_without_started_at_still_works(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'time_limit_minutes' => null,
            'passing_score' => 70,
        ]);

        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'points' => 10,
            'answers' => [
                ['text' => 'Da', 'is_correct' => true],
                ['text' => 'Nu', 'is_correct' => false],
            ],
        ]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $response = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ]);

        $response->assertOk();
    }

    private function createTimedTest(User $owner): Test
    {
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'time_limit_minutes' => 5,
            'passing_score' => 70,
        ]);

        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'points' => 1,
            'answers' => [
                ['text' => 'A', 'is_correct' => true],
                ['text' => 'B', 'is_correct' => false],
            ],
        ]);

        return $test;
    }
}
