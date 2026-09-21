<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestAdminAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fetch_test_results_and_question_analytics(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student', 'name' => 'Ana Pop']);
        $test = Test::factory()->published()->create(['created_by' => $admin->id]);
        $question = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'content' => 'Capitala României?',
            'points' => 5,
            'answers' => [
                ['text' => 'București', 'is_correct' => true],
                ['text' => 'Cluj', 'is_correct' => false],
            ],
        ]);

        TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'attempt_number' => 1,
            'score' => 5,
            'max_score' => 5,
            'correct_answers_count' => 1,
            'total_questions' => 1,
            'percentage' => 100,
            'passed' => true,
            'answers' => [(string) $question->id => 0],
            'completed_at' => now(),
            'status' => 'completed',
            'needs_manual_review' => false,
        ]);

        $results = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/tests/{$test->id}/results");
        $results->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.user.name', 'Ana Pop')
            ->assertJsonPath('0.percentage', '100.00');

        $analytics = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/tests/{$test->id}/question-analytics");
        $analytics->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.question_text', 'Capitala României?')
            ->assertJsonPath('0.correct_rate', 100)
            ->assertJsonPath('0.option_stats.0.count', 1);
    }

    public function test_instructor_cannot_access_other_instructors_test_analytics(): void
    {
        $owner = User::factory()->create(['role' => 'teacher']);
        $other = User::factory()->create(['role' => 'teacher']);
        $test = Test::factory()->published()->create(['created_by' => $owner->id]);

        $this->actingAs($other, 'sanctum')
            ->getJson("/api/admin/tests/{$test->id}/results")
            ->assertForbidden();
    }
}
