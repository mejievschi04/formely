<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestShortAnswerSubmitTest extends TestCase
{
    use RefreshDatabase;

    public function test_short_answer_submit_goes_to_pending_review_and_preserves_text(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'time_limit_minutes' => null,
            'max_attempts' => null,
            'passing_score' => 70,
        ]);
        $question = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'short_answer',
            'content' => 'Descrie procedura de siguranță.',
            'points' => 10,
            'answers' => [
                ['text' => 'Echipament PPE', 'is_correct' => true],
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

        $course->assignedUsers()->attach($student->id, [
            'enrolled' => true,
            'enrolled_at' => now(),
        ]);

        $show = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$course->id}");
        $show->assertOk()
            ->assertJsonPath('questions.0.type', 'short_answer')
            ->assertJsonPath('questions.0.input_type', 'text');

        $response = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [
                (string) $question->id => 'Am folosit echipament PPE complet.',
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('result.needs_manual_review', true)
            ->assertJsonPath('result.passed', false)
            ->assertJsonPath('result.review_questions.0.user_answer', 'Am folosit echipament PPE complet.')
            ->assertJsonPath('result.review_questions.0.pending_manual_review', true);

        $result = TestResult::where('test_id', $test->id)->where('user_id', $student->id)->first();
        $this->assertNotNull($result);
        $this->assertSame('pending_review', $result->status);
        $this->assertTrue($result->needs_manual_review);
        $this->assertSame('Am folosit echipament PPE complet.', $result->answers[(string) $question->id] ?? $result->answers[$question->id] ?? null);
    }
}
