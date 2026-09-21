<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConcurrentExamSubmitTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_opens_share_one_in_progress_row(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        Question::factory()->create(['test_id' => $test->id]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->assertSame(1, TestResult::query()->where('test_id', $test->id)->where('user_id', $student->id)->count());
    }

    public function test_progress_saves_answers_and_locks_previous_question(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        $first = Question::factory()->create(['test_id' => $test->id, 'order' => 0]);
        $second = Question::factory()->create(['test_id' => $test->id, 'order' => 1]);

        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->assertJsonPath('active_attempt.status', 'in_progress');

        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/progress", [
            'answers' => [(string) $first->id => 0],
        ])->assertOk();

        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/progress", [
            'answers' => [
                (string) $first->id => 0,
                (string) $second->id => 1,
            ],
        ])->assertOk();

        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/progress", [
            'answers' => [(string) $first->id => 1],
        ])->assertOk();

        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->assertJsonPath('active_attempt.answers.'.$first->id, 0)
            ->assertJsonPath('active_attempt.answers.'.$second->id, 1);
    }

    public function test_second_submit_returns_the_same_completed_attempt(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        $question = Question::factory()->create(['test_id' => $test->id]);
        $attemptId = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->json('active_attempt.id');

        $payload = [
            'answers' => [$question->id => 0],
            'attempt_id' => $attemptId,
        ];
        $first = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", $payload)
            ->assertOk()
            ->json('result.id');
        $second = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", $payload)
            ->assertOk()
            ->json('result.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, TestResult::query()->where('test_id', $test->id)->where('user_id', $student->id)->count());
    }
}
