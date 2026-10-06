<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestAnswerIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_shuffled_single_answer_keeps_its_text_after_submit_and_reopen(): void
    {
        $this->assertShuffledIdentity('single_choice');
    }

    public function test_shuffled_multiple_answers_keep_their_text_after_submit_and_reopen(): void
    {
        $this->assertShuffledIdentity('multiple_choice');
    }

    public function test_second_attempt_uses_its_own_answer_order(): void
    {
        $this->assertShuffledIdentity('single_choice', 2);
    }

    public function test_unshuffled_answers_remain_unchanged(): void
    {
        $this->assertShuffledIdentity('single_choice', 1, false);
    }

    public function test_result_contains_only_questions_from_the_random_bank_attempt(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $bank = \App\Models\QuestionBank::create(['title' => 'Bancă', 'status' => 'published', 'created_by' => $student->id]);
        $test = Test::factory()->published()->withQuestionBank($bank->id)->create([
            'question_selection' => ['mode' => 'random', 'count' => 2, 'include_starred' => false, 'seed' => 'identity'],
        ]);
        Question::factory()->count(6)->create(['test_id' => null, 'question_bank_id' => $bank->id]);
        $this->actingAs($student, 'sanctum');
        $questions = $this->getJson("/api/exams/{$test->id}?new_attempt=1")->assertOk()->json('questions');
        $this->assertCount(2, $questions);
        $answers = array_fill_keys(array_column($questions, 'id'), [0]);
        $result = $this->postJson("/api/exams/{$test->id}/submit", ['answers' => $answers])->assertOk()->json('result');
        $detail = $this->getJson("/api/exam-results/{$result['id']}?type=test")->assertOk()->json('exam.questions');
        $this->assertSame(array_column($questions, 'id'), array_column($detail, 'id'));
    }

    private function assertShuffledIdentity(string $type, int $attempt = 1, bool $shuffle = true): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create([
            'randomize_answers' => $shuffle, 'randomize_questions' => true,
            'show_correct_answers' => true, 'max_attempts' => 3,
        ]);
        $original = ['Roșu', 'Verde', 'Albastru', 'Galben', 'Mov'];
        $question = Question::factory()->create([
            'test_id' => $test->id, 'type' => $type,
            'answers' => array_map(fn ($text) => ['text' => $text, 'is_correct' => $text === 'Verde'], $original),
        ]);
        if ($attempt > 1) {
            TestResult::create([
                'test_id' => $test->id, 'user_id' => $student->id, 'attempt_number' => 1,
                'score' => 0, 'max_score' => 1, 'percentage' => 0, 'passed' => false,
                'answers' => [$question->id => 0], 'completed_at' => now(), 'status' => 'completed',
            ]);
        }
        $this->actingAs($student, 'sanctum');
        $start = $this->getJson("/api/exams/{$test->id}?new_attempt=1")->assertOk()->json();
        $options = $start['questions'][0]['options'];
        $different = array_keys(array_filter($options, fn ($text, $index) => $text !== $original[$index], ARRAY_FILTER_USE_BOTH));
        if ($shuffle) {
            $this->assertNotEmpty($different, 'Fixture must exercise a changed answer position.');
        } else {
            $different = [1];
        }
        $indices = $type === 'multiple_choice'
            ? array_values(array_diff(array_keys($options), [$different[0]]))
            : [$different[0]];
        $expected = array_map(fn ($index) => $options[$index], $indices);
        sort($expected);
        $result = $this->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$question->id => $type === 'multiple_choice' ? $indices : $indices[0]],
        ])->assertOk()->json('result');
        $this->assertSame($attempt, $result['attempt_number']);
        $stored = $result['answers'][$question->id];
        $savedIndices = is_array($stored) ? $stored : [$stored];
        $review = $result['review_questions'][0];
        $actual = array_map(fn ($index) => $review['options'][$index], $savedIndices);
        sort($actual);
        $this->assertSame($expected, $actual, 'Immediate result must show the selected text.');

        $reopened = $this->getJson("/api/exams/{$test->id}")->assertOk()->json();
        $actual = array_map(fn ($index) => $reopened['questions'][0]['options'][$index], $savedIndices);
        sort($actual);
        $this->assertSame($expected, $actual, 'Reopened exam must show the same selected text.');

        $detail = $this->getJson("/api/exam-results/{$result['id']}?type=test")->assertOk()->json();
        $wire = $detail['exam']['questions'][0];
        $selectedTexts = array_column(array_filter($wire['answers'], fn ($answer) => $answer['is_selected']), 'text');
        sort($selectedTexts);
        $this->assertSame($expected, $selectedTexts, 'Result detail must agree with the submitted choice.');
        foreach ($wire['user_answer_indices'] as $index) {
            $this->assertTrue($wire['answers'][$index]['is_selected'], 'Indices and option flags must use the same order.');
        }
    }
}
