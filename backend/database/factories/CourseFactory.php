<?php

namespace Database\Factories;

use App\Models\Course;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Schema;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Course>
 */
class CourseFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $definition = [
            'title' => fake()->sentence(),
            'description' => fake()->paragraph(),
            'level' => fake()->randomElement(['beginner', 'intermediate', 'advanced']),
            'status' => 'draft',
            'teacher_id' => User::factory(),
            'image' => null,
            'reward_points' => fake()->numberBetween(50, 200),
        ];

        // Only add columns if they exist (for backward compatibility with migrations)
        if (Schema::hasTable('courses')) {
            if (Schema::hasColumn('courses', 'category')) {
                $definition['category'] = fake()->word();
            }
            
            if (Schema::hasColumn('courses', 'settings')) {
                $definition['settings'] = [
                    'access' => [
                        'type' => 'free',
                        'price' => 0,
                        'currency' => 'RON',
                    ],
                    'drip' => [
                        'enabled' => false,
                        'schedule' => null,
                    ],
                    'certificate' => [
                        'enabled' => false,
                        'min_score' => 70,
                        'allow_retake' => true,
                        'max_retakes' => 3,
                    ],
                ];
            }
        }

        return $definition;
    }

    /**
     * Indicate that the course is published.
     */
    public function published(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'published',
        ]);
    }
}

