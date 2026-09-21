<?php

namespace Database\Factories;

use App\Models\CourseMap;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CourseMap>
 */
class CourseMapFactory extends Factory
{
    protected $model = CourseMap::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'description' => fake()->optional()->sentence(),
            'visibility' => 'public',
            'created_by' => User::factory(),
            'order' => 0,
        ];
    }
}
