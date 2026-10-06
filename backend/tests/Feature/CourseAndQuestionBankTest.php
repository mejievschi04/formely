<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseAndQuestionBankTest extends TestCase
{
    use RefreshDatabase;

    public function test_course_show_includes_modules_lessons_and_linked_tests(): void
    {
        $course = Course::withoutEvents(function () {
            return Course::factory()->create([
                'title' => 'Laravel Basics',
                'status' => 'published',
            ]);
        });

        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'Introducere',
                'description' => 'Primii pași',
                'order' => 1,
                'status' => 'published',
            ]);
        });

        Lesson::withoutEvents(function () use ($course, $module) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => $module->id,
                'title' => 'Ce este Laravel',
                'content' => '<p>Laravel este un framework PHP.</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

        $test = Test::withoutEvents(function () {
            return Test::factory()->published()->create([
                'title' => 'Quiz introductiv',
                'question_source' => 'direct',
            ]);
        });

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => null,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $response = $this->getJson("/api/courses/{$course->id}");

        $response->assertOk()
            ->assertJsonPath('title', 'Laravel Basics')
            ->assertJsonPath('modules.0.title', 'Introducere')
            ->assertJsonPath('modules.0.lessons.0.title', 'Ce este Laravel')
            ->assertJsonPath('exams.0.title', 'Quiz introductiv');
    }

    public function test_admin_can_create_question_bank_and_add_questions(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.question-bank@example.com',
            'role' => 'admin',
        ]);

        $createResponse = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/question-banks', [
            'title' => 'Bancă PHP',
            'description' => 'Întrebări despre PHP',
            'status' => 'draft',
        ]);

        $createResponse->assertCreated()
            ->assertJsonPath('bank.title', 'Bancă PHP');

        $bankId = $createResponse->json('bank.id');

        $this->assertDatabaseHas('question_banks', [
            'id' => $bankId,
            'title' => 'Bancă PHP',
            'created_by' => $admin->id,
        ]);

        $addResponse = $this->actingAs($admin, 'sanctum')->postJson("/api/admin/question-banks/{$bankId}/questions", [
            'type' => 'multiple_choice',
            'content' => 'Care este framework-ul folosit în exemplu?',
            'answers' => [
                ['text' => 'Laravel', 'is_correct' => true],
                ['text' => 'React', 'is_correct' => false],
                ['text' => 'Vue', 'is_correct' => false],
                ['text' => 'Angular', 'is_correct' => false],
            ],
            'points' => 2,
            'order' => 1,
            'explanation' => 'Laravel este framework-ul PHP menționat în întrebare.',
        ]);

        $addResponse->assertOk()
            ->assertJsonPath('bank.questions.0.content', 'Care este framework-ul folosit în exemplu?');

        $this->assertDatabaseHas('questions', [
            'question_bank_id' => $bankId,
            'type' => 'multiple_choice',
            'content' => 'Care este framework-ul folosit în exemplu?',
            'points' => 2,
        ]);
    }

    public function test_admin_cannot_add_unsupported_questions_to_bank(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.question-bank-long-answer@example.com',
            'role' => 'admin',
        ]);

        $bank = QuestionBank::create([
            'title' => 'Bancă restricționată',
            'description' => 'Nu mai acceptă tipuri nepermise',
            'status' => 'draft',
            'created_by' => $admin->id,
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/admin/question-banks/{$bank->id}/questions", [
            'type' => 'unsupported_type',
            'content' => 'Ce tip de întrebare nu este acceptat?',
            'answers' => [
                ['text' => 'Răspuns liber', 'is_correct' => true],
            ],
            'points' => 1,
            'order' => 1,
        ]);

        $response->assertStatus(422);

        $this->assertDatabaseMissing('questions', [
            'question_bank_id' => $bank->id,
            'type' => 'unsupported_type',
        ]);
    }

    public function test_admin_test_builder_persists_all_supported_question_types(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.test-question-types@example.com',
            'role' => 'admin',
        ]);

        $test = Test::factory()->create([
            'created_by' => $admin->id,
            'question_source' => 'direct',
            'status' => 'draft',
        ]);

        $cases = [
            'multiple_choice' => [
                ['text' => 'A', 'is_correct' => true],
                ['text' => 'B', 'is_correct' => false],
            ],
            'true_false' => [
                ['text' => 'Adevarat', 'is_correct' => true],
                ['text' => 'Fals', 'is_correct' => false],
            ],
            'matching' => [
                ['left' => 'A', 'right' => '1'],
                ['left' => 'B', 'right' => '2'],
            ],
            'ordering' => [
                ['text' => 'Pasul 1'],
                ['text' => 'Pasul 2'],
            ],
        ];

        foreach ($cases as $type => $answers) {
            $response = $this->actingAs($admin, 'sanctum')->postJson("/api/admin/tests/{$test->id}/questions", [
                'type' => $type,
                'content' => "Question {$type}",
                'answers' => $answers,
                'points' => 1,
            ]);

            $response->assertCreated()
                ->assertJsonPath('question.type', $type);

            $question = Question::findOrFail($response->json('question.id'));
            $this->assertSame($type, $question->type);

            if ($type === 'matching') {
                $this->assertSame('A', $question->answers[0]['left']);
                $this->assertSame('1', $question->answers[0]['right']);
                $this->assertSame('A', $question->answers[0]['text']);
                $this->assertSame('1', $question->answers[0]['answer_text']);
                $this->assertTrue($question->answers[0]['is_correct']);
            } elseif ($type === 'ordering') {
                $this->assertSame('Pasul 1', $question->answers[0]['text']);
                $this->assertSame(0, $question->answers[0]['order']);
                $this->assertTrue($question->answers[0]['is_correct']);
            } else {
                $this->assertSame($answers[0]['text'], $question->answers[0]['text']);
                $this->assertTrue($question->answers[0]['is_correct']);
                $this->assertFalse($question->answers[1]['is_correct']);
            }
        }
    }

    public function test_admin_question_update_preserves_matching_and_ordering_answer_shapes(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.update-question-types@example.com',
            'role' => 'admin',
        ]);

        $test = Test::factory()->create([
            'created_by' => $admin->id,
            'question_source' => 'direct',
            'status' => 'draft',
        ]);

        $matching = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'matching',
            'answers' => [
                ['left' => 'Old A', 'right' => 'Old 1', 'text' => 'Old A', 'answer_text' => 'Old 1', 'is_correct' => true, 'order' => 0],
            ],
        ]);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/questions/{$matching->id}", [
            'type' => 'matching',
            'answers' => [
                ['left' => 'New A', 'right' => 'New 1'],
                ['left' => 'New B', 'right' => 'New 2'],
            ],
        ])->assertOk();

        $matching->refresh();
        $this->assertSame('New A', $matching->answers[0]['left']);
        $this->assertSame('New 1', $matching->answers[0]['right']);
        $this->assertSame('New A', $matching->answers[0]['text']);
        $this->assertSame('New 1', $matching->answers[0]['answer_text']);

        $ordering = Question::factory()->create([
            'test_id' => $test->id,
            'type' => 'ordering',
            'answers' => [
                ['text' => 'Old step', 'is_correct' => true, 'order' => 0],
            ],
        ]);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/questions/{$ordering->id}", [
            'type' => 'ordering',
            'answers' => [
                ['text' => 'Step B'],
                ['text' => 'Step A'],
            ],
        ])->assertOk();

        $ordering->refresh();
        $this->assertSame('Step B', $ordering->answers[0]['text']);
        $this->assertSame(0, $ordering->answers[0]['order']);
        $this->assertTrue($ordering->answers[0]['is_correct']);
        $this->assertSame('Step A', $ordering->answers[1]['text']);
        $this->assertSame(1, $ordering->answers[1]['order']);
    }

    public function test_admin_exam_direct_questions_support_all_question_types(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.exam-question-types@example.com',
            'role' => 'admin',
        ]);

        $course = Course::withoutEvents(fn () => Course::factory()->create([
            'teacher_id' => $admin->id,
        ]));

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'course_id' => $course->id,
            'title' => 'Examen tipuri intrebari',
            'status' => 'draft',
            'passing_score' => 70,
            'questions' => [
                [
                    'question_text' => 'Alege raspunsul corect',
                    'question_type' => 'multiple_choice',
                    'points' => 1,
                    'order' => 0,
                    'answers' => [
                        ['answer_text' => 'Corect', 'is_correct' => true, 'order' => 0],
                        ['answer_text' => 'Gresit', 'is_correct' => false, 'order' => 1],
                    ],
                ],
                [
                    'question_text' => 'Laravel este PHP',
                    'question_type' => 'true_false',
                    'points' => 1,
                    'order' => 1,
                    'answers' => [
                        ['answer_text' => 'Adevarat', 'is_correct' => true, 'order' => 0],
                        ['answer_text' => 'Fals', 'is_correct' => false, 'order' => 1],
                    ],
                ],
                [
                    'question_text' => 'Potriveste perechile',
                    'question_type' => 'matching',
                    'points' => 1,
                    'order' => 2,
                    'payload' => [
                        'pairs' => [
                            ['left' => 'A', 'right' => '1'],
                            ['left' => 'B', 'right' => '2'],
                        ],
                    ],
                ],
                [
                    'question_text' => 'Ordoneaza pasii',
                    'question_type' => 'ordering',
                    'points' => 1,
                    'order' => 3,
                    'payload' => [
                        'items' => ['Pasul 1', 'Pasul 2'],
                    ],
                ],
            ],
        ]);

        $response->assertCreated();
        $examId = $response->json('exam.id');

        $this->assertDatabaseHas('exam_questions', [
            'exam_id' => $examId,
            'question_type' => 'matching',
            'question_text' => 'Potriveste perechile',
        ]);
        $this->assertDatabaseHas('exam_questions', [
            'exam_id' => $examId,
            'question_type' => 'ordering',
            'question_text' => 'Ordoneaza pasii',
        ]);

        $matching = ExamQuestion::where('exam_id', $examId)->where('question_type', 'matching')->firstOrFail();
        $ordering = ExamQuestion::where('exam_id', $examId)->where('question_type', 'ordering')->firstOrFail();

        $this->assertSame('A', $matching->payload['pairs'][0]['left']);
        $this->assertSame('1', $matching->payload['pairs'][0]['right']);
        $this->assertSame('Pasul 1', $ordering->payload['items'][0]);

        $preview = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/exams/{$examId}/preview");
        $preview->assertOk()
            ->assertJsonPath('questions.2.type', 'matching')
            ->assertJsonPath('questions.2.matching.leftItems.0.text', 'A')
            ->assertJsonPath('questions.2.matching.rightItems.0.text', '1')
            ->assertJsonPath('questions.3.type', 'ordering')
            ->assertJsonPath('questions.3.ordering.items.0.text', 'Pasul 1')
            ->assertJsonPath('questions.3.ordering.correctOrder.0', '0');
    }

    public function test_admin_exam_bank_sync_materializes_supported_question_types(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin.exam-bank-sync@example.com',
            'role' => 'admin',
        ]);

        $course = Course::withoutEvents(fn () => Course::factory()->create([
            'teacher_id' => $admin->id,
        ]));

        $bank = QuestionBank::create([
            'title' => 'Banca examen',
            'status' => 'draft',
            'created_by' => $admin->id,
        ]);

        Question::factory()->forQuestionBank($bank->id)->create([
            'type' => 'multiple_choice',
            'content' => 'Alege corect',
            'order' => 0,
            'answers' => [
                ['text' => 'Corect', 'is_correct' => true, 'order' => 0],
                ['text' => 'Gresit', 'is_correct' => false, 'order' => 1],
            ],
        ]);
        Question::factory()->forQuestionBank($bank->id)->create([
            'type' => 'true_false',
            'content' => 'Este adevarat',
            'order' => 1,
            'answers' => [
                ['text' => 'Adevarat', 'is_correct' => true, 'order' => 0],
                ['text' => 'Fals', 'is_correct' => false, 'order' => 1],
            ],
        ]);
        Question::factory()->forQuestionBank($bank->id)->create([
            'type' => 'matching',
            'content' => 'Potrivire banca',
            'order' => 2,
            'answers' => [
                ['left' => 'Stanga A', 'right' => 'Dreapta A', 'text' => 'Stanga A', 'answer_text' => 'Dreapta A', 'is_correct' => true, 'order' => 0],
                ['left' => 'Stanga B', 'right' => 'Dreapta B', 'text' => 'Stanga B', 'answer_text' => 'Dreapta B', 'is_correct' => true, 'order' => 1],
            ],
        ]);
        Question::factory()->forQuestionBank($bank->id)->create([
            'type' => 'ordering',
            'content' => 'Ordonare banca',
            'order' => 3,
            'answers' => [
                ['text' => 'Primul', 'is_correct' => true, 'order' => 0],
                ['text' => 'Al doilea', 'is_correct' => true, 'order' => 1],
            ],
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'course_id' => $course->id,
            'title' => 'Examen din banca',
            'status' => 'draft',
            'settings' => [
                'question_count' => 4,
                'selection_mode' => 'folders',
                'folder_ids' => [$bank->id],
                'include_starred' => false,
            ],
        ]);

        $response->assertCreated();
        $examId = $response->json('exam.id');

        $this->assertSame(4, Exam::findOrFail($examId)->questions()->count());

        $matching = ExamQuestion::where('exam_id', $examId)->where('question_type', 'matching')->firstOrFail();
        $ordering = ExamQuestion::where('exam_id', $examId)->where('question_type', 'ordering')->firstOrFail();
        $choice = ExamQuestion::where('exam_id', $examId)->where('question_type', 'multiple_choice')->firstOrFail();

        $this->assertSame('Stanga A', $matching->payload['pairs'][0]['left']);
        $this->assertSame('Dreapta A', $matching->payload['pairs'][0]['right']);
        $this->assertSame('Primul', $ordering->payload['items'][0]);
        $this->assertSame(2, $choice->answers()->count());

        $preview = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/exams/{$examId}/preview");
        $preview->assertOk();
        $this->assertContains('matching', array_column($preview->json('questions'), 'type'));
        $this->assertContains('ordering', array_column($preview->json('questions'), 'type'));
    }
}
