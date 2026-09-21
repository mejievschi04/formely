<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GrantTestExtraAttemptTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_grant_extra_attempt_after_student_fails(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $test = Test::factory()->published()->create([
            'max_attempts' => 1,
            'passing_score' => 100,
            'randomize_answers' => false,
            'time_limit_minutes' => null,
        ]);
        Question::factory()->create(['test_id' => $test->id, 'points' => 1]);
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => true,
            'passing_score' => 100,
            'order' => 0,
        ]);
        $course->assignedUsers()->attach($student->id, [
            'enrolled' => true,
            'enrolled_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum');
        $this->getJson("/api/exams/{$test->id}?course_id={$course->id}")->assertOk();
        $this->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ])->assertOk()
            ->assertJsonPath('result.passed', false)
            ->assertJsonPath('result.remaining_attempts', 0);

        $this->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ])->assertForbidden();

        $this->actingAs($instructor, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt", [
                'course_id' => $course->id,
            ])
            ->assertOk()
            ->assertJsonPath('extra_attempts', 1)
            ->assertJsonPath('remaining_attempts', 1);

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/exams/{$test->id}/submit", [
                'course_id' => $course->id,
                'answers' => [],
            ])->assertOk();
    }

    public function test_instructor_can_grant_extra_attempt(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => 1]);

        $this->actingAs($instructor, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt")
            ->assertOk()
            ->assertJsonPath('extra_attempts', 1);
    }
}
