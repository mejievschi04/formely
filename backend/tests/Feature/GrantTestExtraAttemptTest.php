<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GrantTestExtraAttemptTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_grant_extra_attempt_after_student_fails(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $test = Test::factory()->published()->create([
            'max_attempts' => 1,
            'passing_score' => 100,
            'randomize_answers' => false,
        ]);
        $question = Question::factory()->create(['test_id' => $test->id, 'points' => 1]);
        $course->tests()->attach($test->id, [
            'scope' => 'course',
            'required' => true,
            'passing_score' => 100,
            'order' => 0,
        ]);
        $student->assignedCourses()->attach($course->id, [
            'is_mandatory' => false,
            'assigned_at' => now(),
            'enrolled' => true,
            'enrolled_at' => now(),
            'assignment_source' => 'direct',
        ]);

        $this->actingAs($student, 'sanctum');
        $this->getJson("/api/exams/{$test->id}?course_id={$course->id}")->assertOk();
        $this->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [$question->id => 1],
        ])->assertOk()
            ->assertJsonPath('result.passed', false)
            ->assertJsonPath('result.remaining_attempts', 0);

        $this->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [$question->id => 0],
        ])->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt", [
                'course_id' => $course->id,
            ])
            ->assertOk()
            ->assertJsonPath('extra_attempts', 1)
            ->assertJsonPath('remaining_attempts', 1);

        $profile = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/users/{$student->id}")
            ->assertOk()
            ->json();
        $coursePayload = collect($profile['courses_assigned'] ?? [])->firstWhere('id', $course->id);
        $this->assertNotNull($coursePayload);
        $this->assertSame('failed', $coursePayload['tests'][0]['status'] ?? null);
        $this->assertSame(1, $coursePayload['tests'][0]['extra_attempts'] ?? null);
        $this->assertSame(1, $coursePayload['tests'][0]['remaining_attempts'] ?? null);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$test->id}?course_id={$course->id}&new_attempt=1")
            ->assertOk()
            ->assertJsonPath('remaining_attempts', 0)
            ->assertJsonPath('can_retake', false);

        $this->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [$question->id => 0],
        ])->assertOk();
    }

    public function test_instructor_grants_extra_attempts_only_on_own_tests(): void
    {
        $owner = User::factory()->create(['role' => 'instructor']);
        $other = User::factory()->create(['role' => 'instructor']);
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['created_by' => $owner->id, 'max_attempts' => 1]);

        $this->actingAs($other, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt")
            ->assertForbidden();
        $this->assertDatabaseCount('user_test_attempt_grants', 0);

        $this->app['auth']->forgetGuards();
        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt")
            ->assertOk()
            ->assertJsonPath('extra_attempts', 1);
    }

    public function test_unlimited_test_rejects_an_extra_attempt_grant(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => null]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/tests/{$test->id}/extra-attempt")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Testul are deja încercări nelimitate.');
        $this->assertDatabaseCount('user_test_attempt_grants', 0);
    }
}
