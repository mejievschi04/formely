<?php

namespace Database\Factories;

use App\Models\Course;
use App\Models\EnrollmentAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<EnrollmentAssignment>
 */
class EnrollmentAssignmentFactory extends Factory
{
    protected $model = EnrollmentAssignment::class;

    public function definition(): array
    {
        return [
            'assignable_type' => EnrollmentAssignment::TYPE_COURSE,
            'course_id' => Course::factory(),
            'learning_path_id' => null,
            'source_type' => EnrollmentAssignment::SOURCE_MANUAL,
            'user_id' => User::factory()->create(['role' => 'student']),
            'is_mandatory' => true,
            'due_at' => null,
            'assigned_by' => User::factory(),
            'assigned_at' => now(),
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
            'metadata' => null,
        ];
    }
}
