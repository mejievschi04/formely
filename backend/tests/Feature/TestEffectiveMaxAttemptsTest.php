<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestEffectiveMaxAttemptsTest extends TestCase
{
    use RefreshDatabase;

    public function test_course_max_retakes_caps_test_max_attempts(): void
    {
        [$student, $course, $test] = $this->seedCourseTest(
            testMaxAttempts: 10,
            courseMaxRetakes: 2,
        );

        $this->assertEffectiveMaxOnShow($student, $course, $test, 2);

        $this->submitOnce($student, $course, $test);
        $this->submitOnce($student, $course, $test);

        $third = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ]);

        $third->assertStatus(403)
            ->assertJsonPath('max_attempts_reached', true)
            ->assertJsonPath('effective_max_attempts', 2);
    }

    public function test_test_max_attempts_caps_when_lower_than_course(): void
    {
        [$student, $course, $test] = $this->seedCourseTest(
            testMaxAttempts: 2,
            courseMaxRetakes: 10,
        );

        $this->assertEffectiveMaxOnShow($student, $course, $test, 2);

        $this->submitOnce($student, $course, $test);
        $this->submitOnce($student, $course, $test);

        $third = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ]);

        $third->assertStatus(403)
            ->assertJsonPath('effective_max_attempts', 2);
    }

    public function test_course_disallow_retake_limits_to_one_attempt(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create([
            'teacher_id' => $owner->id,
            'allow_retake' => false,
            'max_retakes' => 5,
        ]);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'max_attempts' => 5,
            'time_limit_minutes' => null,
        ]);
        $this->attachTestToCourse($course, $test, $student);

        $this->assertEffectiveMaxOnShow($student, $course, $test, 1);

        $this->submitOnce($student, $course, $test);

        $second = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ]);

        $second->assertStatus(403)
            ->assertJsonPath('effective_max_attempts', 1);
    }

    public function test_standalone_test_uses_only_test_max_attempts(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'max_attempts' => 3,
            'time_limit_minutes' => null,
        ]);
        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'points' => 1,
            'answers' => [
                ['text' => 'A', 'is_correct' => true],
                ['text' => 'B', 'is_correct' => false],
            ],
        ]);

        $show = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}");
        $show->assertOk()
            ->assertJsonPath('max_attempts', 3)
            ->assertJsonPath('max_attempts_course', null);
    }

    /**
     * @return array{0: User, 1: Course, 2: Test}
     */
    private function seedCourseTest(int $testMaxAttempts, int $courseMaxRetakes): array
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create([
            'teacher_id' => $owner->id,
            'allow_retake' => true,
            'max_retakes' => $courseMaxRetakes,
        ]);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'max_attempts' => $testMaxAttempts,
            'time_limit_minutes' => null,
        ]);
        $this->attachTestToCourse($course, $test, $student);

        return [$student, $course, $test];
    }

    private function attachTestToCourse(Course $course, Test $test, User $student): void
    {
        Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'points' => 1,
            'answers' => [
                ['text' => 'A', 'is_correct' => true],
                ['text' => 'B', 'is_correct' => false],
            ],
        ]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => false,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $course->assignedUsers()->attach($student->id, [
            'enrolled' => true,
            'enrolled_at' => now(),
        ]);
    }

    private function assertEffectiveMaxOnShow(User $student, Course $course, Test $test, int $expected): void
    {
        $show = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$course->id}");
        $show->assertOk()
            ->assertJsonPath('max_attempts', $expected);
    }

    private function submitOnce(User $student, Course $course, Test $test): void
    {
        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'answers' => [],
        ])->assertOk();
    }
}
