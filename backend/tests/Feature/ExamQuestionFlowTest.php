<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamQuestion;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExamQuestionFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_bank_sync_respects_question_count_and_includes_starred_inside_that_count(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $bank = QuestionBank::create([
            'title' => 'Bancă examen',
            'status' => 'draft',
            'created_by' => $admin->id,
        ]);

        foreach (range(1, 6) as $i) {
            Question::factory()->forQuestionBank($bank->id)->create([
                'content' => "Intrebare {$i}",
                'order' => $i,
                'is_starred' => $i <= 2,
                'answers' => [
                    ['text' => 'Da', 'is_correct' => true, 'order' => 0],
                    ['text' => 'Nu', 'is_correct' => false, 'order' => 1],
                ],
            ]);
        }

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'title' => 'Examen din bancă',
            'status' => 'draft',
            'settings' => [
                'question_count' => 4,
                'selection_mode' => 'folders',
                'folder_ids' => [$bank->id],
                'include_starred' => true,
                'shuffle_questions' => false,
            ],
        ]);

        $response->assertCreated();
        $examId = (int) $response->json('exam.id');
        $exam = Exam::findOrFail($examId);
        $this->assertSame(6, $exam->questions()->count());

        $sourceIds = $exam->questions->map(fn ($q) => $q->payload['source_question_id'] ?? null)->filter()->values();
        $starredSourceIds = Question::whereIn('id', $sourceIds)->where('is_starred', true)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $this->assertCount(2, $starredSourceIds);

        $exam->update(['status' => 'published']);
        $student = User::factory()->create(['role' => 'student', 'email' => 'pool.student@example.com']);
        $ids = collect($this->actingAs($student, 'sanctum')->getJson("/api/exams/{$examId}")->assertOk()->json('questions'))
            ->pluck('id')
            ->all();
        $this->assertCount(4, $ids);
        $attemptSources = $exam->questions()->whereIn('id', $ids)->get()
            ->map(fn ($q) => (int) ($q->payload['source_question_id'] ?? 0))
            ->filter()
            ->values();
        $this->assertEqualsCanonicalizing(
            $starredSourceIds,
            $attemptSources->filter(fn ($id) => in_array($id, $starredSourceIds, true))->sort()->values()->all()
        );
    }

    public function test_exam_can_pick_specific_questions_from_tests_not_just_folders(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $bank = QuestionBank::create([
            'title' => 'Bancă ignorată',
            'status' => 'draft',
            'created_by' => $admin->id,
        ]);
        Question::factory()->forQuestionBank($bank->id)->create(['content' => 'Din folder']);

        $test = Test::factory()->create([
            'title' => 'Test sursă',
            'created_by' => $admin->id,
            'question_source' => 'direct',
        ]);
        $picked = Question::factory()->create([
            'test_id' => $test->id,
            'content' => 'Întrebare aleasă din test',
            'answers' => [
                ['text' => 'Da', 'is_correct' => true, 'order' => 0],
                ['text' => 'Nu', 'is_correct' => false, 'order' => 1],
            ],
        ]);
        Question::factory()->create([
            'test_id' => $test->id,
            'content' => 'Întrebare nealeasă',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'title' => 'Examen din întrebări alese',
            'status' => 'draft',
            'settings' => [
                'selection_mode' => 'questions',
                'question_ids' => [$picked->id],
                'folder_ids' => [$bank->id],
                'question_count' => 10,
            ],
        ]);

        $response->assertCreated();
        $examId = (int) $response->json('exam.id');
        $exam = Exam::findOrFail($examId);
        $this->assertSame('questions', $exam->settings['selection_mode'] ?? null);
        $this->assertSame(1, $exam->questions()->count());
        $this->assertSame($picked->id, $exam->questions->first()->payload['source_question_id'] ?? null);
        $this->assertSame('Întrebare aleasă din test', $exam->questions->first()->question_text);
    }

    public function test_selected_questions_form_a_pool_with_starred_priority(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $test = Test::factory()->create([
            'title' => 'Test pool',
            'created_by' => $admin->id,
            'question_source' => 'direct',
        ]);
        $ids = [];
        foreach (range(1, 5) as $i) {
            $question = Question::factory()->create([
                'test_id' => $test->id,
                'content' => "Picked {$i}",
                'is_starred' => $i <= 2,
                'answers' => [
                    ['text' => 'Da', 'is_correct' => true, 'order' => 0],
                    ['text' => 'Nu', 'is_correct' => false, 'order' => 1],
                ],
            ]);
            $ids[] = $question->id;
        }

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exams', [
            'title' => 'Examen pool ales',
            'status' => 'published',
            'settings' => [
                'selection_mode' => 'questions',
                'question_ids' => $ids,
                'question_count' => 3,
                'include_starred' => true,
                'access_mode' => 'all_students',
            ],
        ]);

        $response->assertCreated();
        $examId = (int) $response->json('exam.id');
        $exam = Exam::findOrFail($examId);
        $this->assertSame(5, $exam->questions()->count());
        $this->assertSame(3, (int) ($exam->settings['question_count'] ?? 0));

        $student = User::factory()->create(['role' => 'student']);
        $attemptIds = collect($this->actingAs($student, 'sanctum')->getJson("/api/exams/{$examId}")->assertOk()->json('questions'))
            ->pluck('id')
            ->all();
        $this->assertCount(3, $attemptIds);
        $sources = $exam->questions()->whereIn('id', $attemptIds)->get()
            ->map(fn ($q) => (int) ($q->payload['source_question_id'] ?? 0))
            ->all();
        $this->assertContains($ids[0], $sources);
        $this->assertContains($ids[1], $sources);
    }

    public function test_shuffle_questions_changes_order_per_attempt_but_keeps_scoring(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $exam = Exam::create([
            'title' => 'Examen amestecat',
            'status' => 'published',
            'course_id' => null,
            'passing_score' => 50,
            'max_attempts' => 3,
            'settings' => [
                'shuffle_questions' => true,
                'access_mode' => 'all_students',
                'manual_review' => false,
            ],
        ]);

        $labels = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
        foreach ($labels as $index => $label) {
            $question = ExamQuestion::create([
                'exam_id' => $exam->id,
                'question_text' => $label,
                'question_type' => 'single_choice',
                'points' => 1,
                'order' => $index,
            ]);
            ExamAnswer::create([
                'exam_question_id' => $question->id,
                'answer_text' => 'Corect',
                'is_correct' => true,
                'order' => 0,
            ]);
            ExamAnswer::create([
                'exam_question_id' => $question->id,
                'answer_text' => 'Gresit',
                'is_correct' => false,
                'order' => 1,
            ]);
        }

        $first = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$exam->id}");
        $first->assertOk();
        $firstIds = array_column($first->json('questions'), 'id');
        $storedOrder = $exam->questions()->orderBy('order')->pluck('id')->all();
        $this->assertNotSame($storedOrder, $firstIds, 'Amestecarea trebuie să schimbe ordinea față de snapshot.');

        $again = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$exam->id}");
        $again->assertOk();
        $this->assertSame($firstIds, array_column($again->json('questions'), 'id'));

        $answers = [];
        foreach ($exam->questions as $question) {
            $answers[(string) $question->id] = 0;
        }

        $submit = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$exam->id}/submit", [
            'answers' => $answers,
        ]);
        $submit->assertOk();
        $this->assertTrue((bool) $submit->json('result.passed'));
        $this->assertSame(100.0, (float) $submit->json('result.percentage'));

        $secondAttempt = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$exam->id}?new_attempt=1");
        $secondAttempt->assertOk();
        $secondIds = array_column($secondAttempt->json('questions'), 'id');
        $this->assertNotSame($firstIds, $secondIds, 'O nouă încercare trebuie să amestece din nou.');
        $this->assertEqualsCanonicalizing($firstIds, $secondIds);
    }

    public function test_unshuffled_exam_keeps_saved_question_order(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $exam = Exam::create([
            'title' => 'Examen fără amestec',
            'status' => 'published',
            'course_id' => null,
            'passing_score' => 50,
            'max_attempts' => 2,
            'settings' => [
                'shuffle_questions' => false,
                'access_mode' => 'all_students',
            ],
        ]);

        foreach (['Una', 'Doua', 'Trei'] as $index => $label) {
            ExamQuestion::create([
                'exam_id' => $exam->id,
                'question_text' => $label,
                'question_type' => 'true_false',
                'points' => 1,
                'order' => $index,
            ]);
        }

        $response = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$exam->id}");
        $response->assertOk();
        $this->assertSame(['Una', 'Doua', 'Trei'], array_column($response->json('questions'), 'text'));
    }

    public function test_team_access_includes_current_members_and_skips_exclusions(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $member = User::factory()->create(['role' => 'student']);
        $excluded = User::factory()->create(['role' => 'student']);
        $outsider = User::factory()->create(['role' => 'student']);
        $team = \App\Models\Team::create([
            'name' => 'Echipa acces',
            'owner_id' => $admin->id,
        ]);
        $team->users()->attach([$member->id, $excluded->id]);

        $exam = Exam::create([
            'title' => 'Examen pe echipă',
            'status' => 'published',
            'course_id' => null,
            'passing_score' => 50,
            'max_attempts' => 1,
            'settings' => [
                'access_mode' => 'teams',
                'team_ids' => [$team->id],
                'excluded_student_ids' => [$excluded->id],
            ],
        ]);

        $memberIds = collect($this->actingAs($member, 'sanctum')->getJson('/api/exams')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertContains($exam->id, $memberIds);

        $excludedIds = collect($this->actingAs($excluded, 'sanctum')->getJson('/api/exams')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($exam->id, $excludedIds);
        $this->actingAs($excluded, 'sanctum')->getJson("/api/exams/{$exam->id}")->assertForbidden();

        $outsiderIds = collect($this->actingAs($outsider, 'sanctum')->getJson('/api/exams')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($exam->id, $outsiderIds);

        $newcomer = User::factory()->create(['role' => 'student']);
        $team->users()->attach($newcomer->id);
        $newcomerIds = collect($this->actingAs($newcomer, 'sanctum')->getJson('/api/exams')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertContains($exam->id, $newcomerIds);
    }
}
