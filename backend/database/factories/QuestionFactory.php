<?php

namespace Database\Factories;

use App\Models\Question;
use App\Models\Test;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Question>
 */
class QuestionFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'test_id' => Test::factory(),
            'question_bank_id' => null,
            'type' => 'multiple_choice',
            'content' => fake()->sentence() . '?',
            'answers' => [
                [
                    'text' => fake()->sentence(),
                    'is_correct' => true,
                ],
                [
                    'text' => fake()->sentence(),
                    'is_correct' => false,
                ],
                [
                    'text' => fake()->sentence(),
                    'is_correct' => false,
                ],
            ],
            'points' => fake()->numberBetween(1, 10),
            'order' => 0,
            'explanation' => fake()->optional()->paragraph(),
            'metadata' => null,
        ];
    }

    /**
     * Indicate that the question is true/false type.
     */
    public function trueFalse(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => 'true_false',
            'answers' => [
                [
                    'text' => 'True',
                    'is_correct' => true,
                ],
                [
                    'text' => 'False',
                    'is_correct' => false,
                ],
            ],
        ]);
    }

    /**
     * Indicate that the question belongs to a question bank.
     */
    public function forQuestionBank(int $questionBankId): static
    {
        return $this->state(fn (array $attributes) => [
            'test_id' => null,
            'question_bank_id' => $questionBankId,
        ]);
    }
}

