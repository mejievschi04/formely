<?php

namespace Tests\Unit;

use Formely\Evals\ResearchAssertions;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../../evals/volt/ResearchAssertions.php';

class LmsResearchAssertionsTest extends TestCase
{
    private function case(): array
    {
        return ['id' => 'calculation', 'flow' => 'test', 'expected_answers' => [['eficien', '\\b80\\b']]];
    }

    private function response(int $index): array
    {
        return ['needs_more_context' => false, 'questions' => [['question' => 'Care este eficiența?', 'options' => ['80%', '20%', '100%', '50%'], 'correct_answer' => $index]]];
    }

    public function test_correctness_check_preserves_answer_index_zero(): void
    {
        ResearchAssertions::check($this->case(), $this->response(0));
        $this->addToAssertionCount(1);
    }

    public function test_valid_question_shape_with_wrong_correct_answer_fails_the_independent_reference(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Răspunsul marcat corect');
        ResearchAssertions::check($this->case(), $this->response(1));
    }

    public function test_a_fact_question_does_not_satisfy_a_request_for_conflict_clarification(): void
    {
        $this->expectException(\RuntimeException::class);
        ResearchAssertions::check(['flow' => 'test', 'expect_clarification' => true], $this->response(0));
    }

    public function test_an_unrequested_delete_fails_even_if_the_requested_edit_is_present(): void
    {
        $this->expectException(\RuntimeException::class);
        ResearchAssertions::check(['flow' => 'builder', 'expected_operation' => ['op' => 'update_lesson', 'lesson_id' => 21], 'forbidden_operations' => ['delete_lesson']],
            ['response_type' => 'builder_diff', 'operations' => [['op' => 'update_lesson', 'lesson_id' => 21], ['op' => 'delete_lesson', 'lesson_id' => 22]]]);
    }
}
