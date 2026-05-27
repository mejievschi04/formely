<?php

namespace Tests\Unit;

use App\Models\Test;
use App\Services\TestAttemptAnswerOrderService;
use PHPUnit\Framework\TestCase;

class TestAttemptAnswerOrderServiceTest extends TestCase
{
    public function test_normalizes_display_index_to_original_when_answers_are_shuffled(): void
    {
        $service = new TestAttemptAnswerOrderService();
        $test = new Test([
            'id' => 9,
            'randomize_answers' => true,
            'question_selection' => ['seed' => 'demo', 'variant_pool_size' => 1],
        ]);
        $question = (object) [
            'id' => 42,
            'type' => 'single_choice',
            'answers' => [
                ['text' => 'Răspuns A', 'is_correct' => true],
                ['text' => 'Răspuns B', 'is_correct' => false],
                ['text' => 'Răspuns C', 'is_correct' => false],
            ],
        ];

        $order = $service->resolveChoiceOrderForAttempt($test, $question, 7, 1);
        $displayIndexB = $order['original_to_display'][1] ?? null;
        $this->assertNotNull($displayIndexB, 'Expected shuffled display slot for original index 1');

        $normalized = $service->normalizeSubmittedAnswers($test, [$question], 7, 1, [
            42 => $displayIndexB,
        ]);

        $this->assertSame(1, $normalized[42]);

        $restored = $service->selectedOriginalIndicesFromStored($normalized[42], 'single_choice', $order);
        $this->assertSame([1], $restored);

        $this->assertFalse($service->gradeChoiceInOriginalSpace('single_choice', [1], [0]));
        $this->assertTrue($service->gradeChoiceInOriginalSpace('single_choice', [0], [0]));
    }

    public function test_multiple_choice_stores_all_original_indices(): void
    {
        $service = new TestAttemptAnswerOrderService();
        $test = new Test([
            'id' => 10,
            'randomize_answers' => true,
            'question_selection' => ['seed' => 'multi', 'variant_pool_size' => 1],
        ]);
        $question = (object) [
            'id' => 5,
            'type' => 'multiple_choice',
            'answers' => [
                ['text' => 'A', 'is_correct' => true],
                ['text' => 'B', 'is_correct' => true],
                ['text' => 'C', 'is_correct' => false],
            ],
        ];

        $order = $service->resolveChoiceOrderForAttempt($test, $question, 3, 2);
        $pickDisplay = [];
        foreach ($order['display_to_original'] as $displayIdx => $originalIdx) {
            if (in_array($originalIdx, [0, 1], true)) {
                $pickDisplay[] = $displayIdx;
            }
        }

        $normalized = $service->normalizeSubmittedAnswers($test, [$question], 3, 2, [
            5 => $pickDisplay,
        ]);

        sort($normalized[5]);
        $this->assertSame([0, 1], $normalized[5]);
        $this->assertTrue($service->gradeChoiceInOriginalSpace('multiple_choice', $normalized[5], [0, 1]));
    }
}
