<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use App\Services\TestBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestSubmissionFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_score_saved_results_and_attempt_limit_agree(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => 1, 'randomize_answers' => false]);
        $first = Question::factory()->create(['test_id' => $test->id, 'points' => 3]);
        $second = Question::factory()->create(['test_id' => $test->id, 'points' => 1]);
        $this->actingAs($student, 'sanctum');
        $this->getJson("/api/exams/{$test->id}")->assertOk();
        $response = $this->postJson("/api/exams/{$test->id}/submit", ['answers' => [
            $first->id => 0, $second->id => 1,
        ]])->assertOk()->assertJsonPath('result.score', 3)
            ->assertJsonPath('result.percentage', 75)
            ->assertJsonPath('result.correct_answers_count', 1)
            ->assertJsonPath('result.total_questions', 2)
            ->assertJsonPath('result.remaining_attempts', 0);
        $id = $response->json('result.id');
        $this->getJson("/api/exam-results/{$id}?type=test")->assertOk()
            ->assertJsonPath('percentage', fn ($value) => (float) $value === 75.0);
        $this->postJson("/api/exams/{$test->id}/submit", ['answers' => []])->assertForbidden();
        $other = User::factory()->create(['role' => 'student']);
        $response = $this->actingAs($other, 'sanctum')->getJson("/api/exam-results/{$id}?type=test");
        $this->assertContains($response->status(), [403, 404]);
        $this->assertDatabaseCount('test_results', 1);
    }

    public function test_written_answers_wait_for_manual_review(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create();
        $question = Question::factory()->create(['test_id' => $test->id, 'type' => 'essay', 'answers' => []]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$question->id => 'Răspuns de verificat'],
        ])->assertOk()->assertJsonPath('result.status', 'pending_review')
            ->assertJsonPath('result.needs_manual_review', true)->assertJsonPath('result.passed', false);
    }

    public function test_one_attempt_is_one_attempt_across_courses(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => 1, 'randomize_answers' => false]);
        $question = Question::factory()->create(['test_id' => $test->id, 'points' => 1]);
        $courseA = Course::factory()->published()->create();
        $courseB = Course::factory()->published()->create();
        foreach ([$courseA, $courseB] as $course) {
            CourseTest::create([
                'course_id' => $course->id,
                'test_id' => $test->id,
                'scope' => 'course',
                'scope_id' => null,
                'order' => 1,
                'required' => false,
                'passing_score' => 70,
            ]);
            // cursanții primesc cursurile prin atribuire (nu se mai înscriu singuri)
            \Illuminate\Support\Facades\DB::table('course_user')->insert([
                'course_id' => $course->id, 'user_id' => $student->id, 'enrolled' => true, 'enrolled_at' => now(),
                'is_mandatory' => false, 'assigned_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$test->id}?course_id={$courseA->id}")
            ->assertOk();
        $this->actingAs($student, 'sanctum')
            ->postJson("/api/exams/{$test->id}/submit?course_id={$courseA->id}", [
                'answers' => [$question->id => 0],
            ])
            ->assertOk()
            ->assertJsonPath('result.remaining_attempts', 0);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$test->id}?course_id={$courseB->id}")
            ->assertOk()
            ->assertJsonPath('can_retake', false)
            ->assertJsonPath('remaining_attempts', 0);
        $this->assertDatabaseCount('test_results', 1);

        $this->actingAs($student, 'sanctum')
            ->postJson("/api/exams/{$test->id}/submit?course_id={$courseB->id}", [
                'answers' => [$question->id => 0],
            ])
            ->assertForbidden();
        $this->assertDatabaseCount('test_results', 1);
    }

    public function test_unlimited_attempts_allow_another_submission(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => null, 'randomize_answers' => false]);
        $question = Question::factory()->create(['test_id' => $test->id, 'points' => 1]);

        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$question->id => 0],
        ])->assertOk()->assertJsonPath('result.remaining_attempts', null);

        $this->getJson("/api/exams/{$test->id}?new_attempt=1")->assertOk()->assertJsonPath('can_retake', true);
        $this->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$question->id => 0],
        ])->assertOk();
        $this->assertDatabaseCount('test_results', 2);
    }

    public function test_blank_attempt_limit_is_stored_as_unlimited(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $preset = app(TestBuilderService::class)->createTest([
            'title' => 'Preset nelimitat',
        ], $admin);
        $this->assertNull($preset->fresh()->max_attempts);
        $this->assertTrue((bool) $preset->show_only_submitted_answers);
        $this->assertFalse((bool) $preset->show_correct_answers);

        $test = app(TestBuilderService::class)->createTest([
            'title' => 'Test fără limită',
            'max_attempts' => null,
        ], $admin);
        $this->assertNull($test->fresh()->max_attempts);

        $updated = app(TestBuilderService::class)->updateTest($test, ['max_attempts' => 1]);
        $this->assertSame(1, (int) $updated->fresh()->max_attempts);
        $cleared = app(TestBuilderService::class)->updateTest($updated, ['max_attempts' => null]);
        $this->assertNull($cleared->fresh()->max_attempts);

        $created = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'title' => 'Examen fără limită',
            'max_attempts' => null,
            'status' => 'draft',
        ])->assertCreated();
        $examId = (int) $created->json('exam.id');
        $this->assertNull(Exam::findOrFail($examId)->max_attempts);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/exams/{$examId}", [
            'max_attempts' => 1,
        ])->assertOk();
        $this->assertSame(1, (int) Exam::findOrFail($examId)->max_attempts);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/exams/{$examId}", [
            'max_attempts' => null,
        ])->assertOk();
        $this->assertNull(Exam::findOrFail($examId)->max_attempts);
    }

    public function test_flexible_deadline_allows_access_after_expiry(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $past = now()->subDay()->toIso8601String();
        $blocked = Exam::create([
            'title' => 'Termen strict',
            'status' => 'published',
            'course_id' => null,
            'passing_score' => 70,
            'max_attempts' => null,
            'settings' => [
                'deadline_type' => 'fixed',
                'deadline_at' => $past,
                'deadline_flexible' => false,
            ],
        ]);
        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$blocked->id}")
            ->assertForbidden()
            ->assertJsonPath('deadline_passed', true);

        $open = Exam::create([
            'title' => 'Termen flexibil',
            'status' => 'published',
            'course_id' => null,
            'passing_score' => 70,
            'max_attempts' => null,
            'settings' => [
                'deadline_type' => 'fixed',
                'deadline_at' => $past,
                'deadline_flexible' => true,
                'show_only_submitted_answers' => true,
            ],
        ]);
        $question = $open->questions()->create([
            'question_text' => 'Întrebare',
            'question_type' => 'single_choice',
            'points' => 1,
            'order' => 0,
        ]);
        $question->answers()->create(['answer_text' => 'Da', 'is_correct' => true, 'order' => 0]);
        $question->answers()->create(['answer_text' => 'Nu', 'is_correct' => false, 'order' => 1]);
        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$open->id}")
            ->assertOk()
            ->assertJsonPath('deadline_flexible', true)
            ->assertJsonPath('deadline_overdue', true)
            ->assertJsonPath('show_only_submitted_answers', true);
    }

    public function test_expired_attempt_is_spent_in_every_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['max_attempts' => 1, 'time_limit_minutes' => 10]);
        Question::factory()->create(['test_id' => $test->id, 'points' => 1]);
        $courseA = Course::factory()->published()->create();
        $courseB = Course::factory()->published()->create();
        foreach ([$courseA, $courseB] as $course) {
            CourseTest::create([
                'course_id' => $course->id,
                'test_id' => $test->id,
                'scope' => 'course',
                'scope_id' => null,
                'order' => 1,
                'required' => false,
                'passing_score' => 70,
            ]);
            // cursanții primesc cursurile prin atribuire (nu se mai înscriu singuri)
            \Illuminate\Support\Facades\DB::table('course_user')->insert([
                'course_id' => $course->id, 'user_id' => $student->id, 'enrolled' => true, 'enrolled_at' => now(),
                'is_mandatory' => false, 'assigned_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        TestResult::create([
            'test_id' => $test->id,
            'course_id' => $courseA->id,
            'user_id' => $student->id,
            'attempt_number' => 1,
            'score' => 0,
            'max_score' => 1,
            'percentage' => 0,
            'passed' => false,
            'answers' => [],
            'started_at' => now()->subHour(),
            'expires_at' => now()->subMinute(),
            'completed_at' => null,
            'status' => 'in_progress',
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$test->id}?course_id={$courseB->id}")
            ->assertOk()
            ->assertJsonPath('can_retake', false)
            ->assertJsonPath('remaining_attempts', 0);
        $this->assertSame(1, TestResult::query()->where('test_id', $test->id)->where('user_id', $student->id)->count());
        $this->assertDatabaseHas('test_results', [
            'test_id' => $test->id,
            'user_id' => $student->id,
            'status' => 'expired',
        ]);
    }
}
