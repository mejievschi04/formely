<?php

namespace Database\Factories;

use App\Models\Test;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Test>
 */
class TestFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(),
            'description' => fake()->paragraph(),
            'type' => fake()->randomElement(['practice', 'graded', 'final']),
            'status' => 'draft',
            'time_limit_minutes' => fake()->numberBetween(15, 120),
            'max_attempts' => fake()->numberBetween(1, 5),
            'randomize_questions' => false,
            'randomize_answers' => false,
            'show_results_immediately' => true,
            'show_correct_answers' => false,
            'allow_review' => true,
            'question_source' => 'direct',
            'question_set_id' => null,
            'created_by' => User::factory(),
            'version' => '1.0.0',
        ];
    }

    /**
     * Indicate that the test is published.
     */
    public function published(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'published',
        ]);
    }

    /**
     * Indicate that the test uses a question bank.
     */
    public function withQuestionBank(int $questionBankId): static
    {
        return $this->state(fn (array $attributes) => [
            'question_source' => 'bank',
            'question_set_id' => $questionBankId,
        ]);
    }
}

