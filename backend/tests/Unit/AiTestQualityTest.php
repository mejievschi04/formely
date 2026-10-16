<?php

namespace Tests\Unit;

use App\Services\AiTestQuality;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class AiTestQualityTest extends TestCase
{
    public static function invalidQuestions(): array
    {
        return [
            'out of range' => [['correct_answer' => 4]],
            'boolean index' => [['correct_answer' => false]],
            'missing answer' => [['correct_answer' => null]],
            'empty explanation' => [['explanation' => '']],
            'duplicate options' => [['options' => ['80 J', ' 80 J ', '20 J', '40 J']]],
            'wrong type' => [['type' => 'ordering']],
            'contradicting flags' => [['answers' => [['text' => 'A', 'is_correct' => false], ['text' => 'B', 'is_correct' => true], ['text' => 'C', 'is_correct' => false], ['text' => 'D', 'is_correct' => false]], 'options' => null]],
        ];
    }

    #[DataProvider('invalidQuestions')]
    public function test_invalid_questions_cannot_be_accepted_as_a_usable_test(array $changes): void
    {
        $question = array_replace(['question' => 'Câtă energie utilă livrează?', 'options' => ['80 J', '100 J', '20 J', '40 J'], 'correct_answer' => 0, 'explanation' => 'Materialul precizează 80 J utili.'], $changes);
        $this->expectException(\RuntimeException::class);
        (new AiTestQuality)->validate(['title' => 'Energie', 'questions' => [$question]], 1);
    }

    public function test_correct_answer_zero_and_object_answers_are_preserved(): void
    {
        $result = (new AiTestQuality)->validate(['title' => 'Energie', 'questions' => [[
            'content' => 'Câtă energie utilă livrează?', 'answers' => [['text' => '80 J', 'is_correct' => true], ['text' => '100 J', 'is_correct' => false], ['text' => '20 J', 'is_correct' => false], ['text' => '40 J', 'is_correct' => false]],
            'explanation' => 'Materialul precizează 80 J utili.',
        ]]], 1);
        $this->assertSame(0, $result['questions'][0]['correct_answer']);
        $this->assertSame('80 J', $result['questions'][0]['options'][0]);
    }
}
