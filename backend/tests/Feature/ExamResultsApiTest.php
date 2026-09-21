<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use App\Services\TestAttemptAnswerOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExamResultsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_exam_results_lists_all_attempts_and_uses_saved_course_context(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $firstCourse = Course::factory()->published()->create([
            'title' => 'Curs A',
            'teacher_id' => $owner->id,
        ]);
        $secondCourse = Course::factory()->published()->create([
            'title' => 'Curs B',
            'teacher_id' => $owner->id,
        ]);
        $test = Test::factory()->published()->create([
            'title' => 'Test reutilizat',
            'created_by' => $owner->id,
            'max_attempts' => 3,
        ]);

        CourseTest::create([
            'course_id' => $firstCourse->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $firstCourse->id,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        CourseTest::create([
            'course_id' => $secondCourse->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $secondCourse->id,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        TestResult::create([
            'test_id' => $test->id,
            'course_id' => $firstCourse->id,
            'user_id' => $student->id,
            'score' => 50,
            'max_score' => 100,
            'percentage' => 50,
            'passed' => false,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'completed_at' => now()->subMinutes(10),
            'status' => 'completed',
        ]);

        $latest = TestResult::create([
            'test_id' => $test->id,
            'course_id' => $secondCourse->id,
            'user_id' => $student->id,
            'score' => 90,
            'max_score' => 100,
            'percentage' => 90,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'completed_at' => now()->subMinutes(2),
            'status' => 'completed',
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson('/api/exam-results');

        $response->assertOk();
        $results = collect($response->json());

        $this->assertCount(2, $results);
        $this->assertSame($secondCourse->id, $results->first()['course_id']);
        $this->assertSame('Curs B', $results->first()['exam']['course']['title']);
        $this->assertTrue($results->contains(fn ($row) => $row['course_id'] === $firstCourse->id && $row['exam']['course']['title'] === 'Curs A'));

        $detail = $this->actingAs($student, 'sanctum')->getJson("/api/exam-results/{$latest->id}?type=test");

        $detail->assertOk()
            ->assertJsonPath('course_id', $secondCourse->id)
            ->assertJsonPath('exam.course.title', 'Curs B')
            ->assertJsonPath('test.course.title', 'Curs B');
    }

    public function test_exam_result_detail_maps_text_answer_to_selected_correct_option(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'randomize_answers' => false,
        ]);
        $question = Question::factory()->create([
            'test_id' => $test->id,
            'content' => 'De ce sau dece?',
            'points' => 1,
            'answers' => [
                ['text' => 'de ce', 'is_correct' => true, 'order' => 0],
                ['text' => 'dece', 'is_correct' => false, 'order' => 1],
            ],
        ]);
        $result = TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 0,
            'max_score' => 1,
            'percentage' => 0,
            'passed' => false,
            'attempt_number' => 1,
            'answers' => [(string) $question->id => 'de ce'],
            'completed_at' => now(),
            'status' => 'completed',
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson("/api/exam-results/{$result->id}?type=test");

        $response->assertOk()
            ->assertJsonPath('exam.questions.0.is_correct', true)
            ->assertJsonPath('exam.questions.0.user_answer_index', 0)
            ->assertJsonPath('exam.questions.0.answers.0.is_selected', true)
            ->assertJsonPath('exam.questions.0.answers.0.is_correct', true);
    }

    public function test_submit_review_questions_align_with_shuffled_display_order(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'instructor']);
        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = Test::factory()->published()->create([
            'created_by' => $owner->id,
            'randomize_answers' => true,
            'question_selection' => ['seed' => 'shuffle-test', 'variant_pool_size' => 1],
            'passing_score' => 70,
        ]);
        $question = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'single_choice',
            'content' => 'Întrebare shuffle',
            'points' => 10,
            'answers' => [
                ['text' => 'Răspuns corect', 'is_correct' => true],
                ['text' => 'Greșit 1', 'is_correct' => false],
                ['text' => 'Greșit 2', 'is_correct' => false],
            ],
        ]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'module',
            'scope_id' => null,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $orderService = new TestAttemptAnswerOrderService();
        $order = $orderService->resolveChoiceOrderForAttempt($test, $question, $student->id, 1);
        $correctDisplay = $order['correct_display_indices'][0] ?? null;
        $this->assertNotNull($correctDisplay, 'Expected a display slot for the correct original answer');

        $submit = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'course_id' => $course->id,
            'started_at' => now()->subMinute()->toIso8601String(),
            'answers' => [
                (string) $question->id => $correctDisplay,
            ],
        ]);

        $submit->assertOk()
            ->assertJsonPath('result.correct_answers_count', 1)
            ->assertJsonPath('result.total_questions', 1)
            ->assertJsonPath('result.percentage', 100)
            ->assertJsonPath('result.review_questions.0.is_correct', true)
            ->assertJsonPath('result.review_questions.0.user_answer_index', $correctDisplay)
            ->assertJsonPath('result.review_questions.0.user_answer_labels.0', 'Răspuns corect');

        $reload = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$course->id}");
        $reload->assertOk()
            ->assertJsonPath('questions.0.is_correct', true)
            ->assertJsonPath('questions.0.user_answer_index', $correctDisplay);
    }

    public function test_exam_results_index_excludes_standalone_exam_attempts(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $exam = Exam::create([
            'title' => 'Examen catalog',
            'status' => 'published',
            'created_by' => $owner->id,
            'course_id' => null,
            'passing_score' => 70,
        ]);
        ExamResult::create([
            'exam_id' => $exam->id,
            'user_id' => $student->id,
            'score' => 80,
            'total_points' => 100,
            'percentage' => 80,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
        ]);

        $test = Test::factory()->published()->create([
            'title' => 'Test modul',
            'created_by' => $owner->id,
        ]);
        TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 60,
            'max_score' => 100,
            'percentage' => 60,
            'passed' => false,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
            'status' => 'completed',
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson('/api/exam-results');

        $response->assertOk();
        $results = collect($response->json());
        $this->assertCount(1, $results);
        $this->assertSame('test', $results->first()['type']);
        $this->assertSame($test->id, $results->first()['test_id']);
        $this->assertFalse($results->contains(fn ($row) => ($row['type'] ?? null) === 'exam'));
    }
}
