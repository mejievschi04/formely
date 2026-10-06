<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Un instructor lucrează doar cu întrebările din folderele lui.
 */
class InstructorOwnershipTest extends TestCase
{
    use RefreshDatabase;

    public function test_instructor_cannot_change_questions_in_another_instructors_bank(): void
    {
        $owner = User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        $other = User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        $bank = QuestionBank::create(['title' => 'Folderul proprietarului', 'status' => 'published', 'created_by' => $owner->id]);
        $question = Question::factory()->create(['test_id' => null, 'question_bank_id' => $bank->id, 'content' => 'Original?']);
        $payload = ['type' => 'single_choice', 'content' => 'Schimbat?', 'answers' => [['text' => 'Da', 'is_correct' => true], ['text' => 'Nu', 'is_correct' => false]]];

        $this->actingAs($other, 'sanctum');
        $this->postJson("/api/admin/question-banks/{$bank->id}/questions", $payload)->assertForbidden();
        $this->putJson("/api/admin/question-banks/{$bank->id}/questions/{$question->id}", $payload)->assertForbidden();
        $this->postJson("/api/admin/question-banks/{$bank->id}/questions/reorder", ['question_ids' => [$question->id]])->assertForbidden();
        $this->deleteJson("/api/admin/question-banks/{$bank->id}/questions/{$question->id}")->assertForbidden();

        $this->assertSame('Original?', $question->fresh()?->content);
        $this->assertSame(1, Question::where('question_bank_id', $bank->id)->count());

        // proprietarul poate
        $this->app['auth']->forgetGuards();
        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/admin/question-banks/{$bank->id}/questions/{$question->id}", $payload)
            ->assertOk();
    }

}
