<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\ContentBlock;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AiTestGenerationTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        config(['ai.enabled' => true, 'ai.provider' => 'openai', 'ai.openai.api_key' => 'test-only', 'ai.openai.api_url' => 'https://ai.example.test/v1']);
        Http::preventStrayRequests();
        $company = Company::create(['name' => 'AI tests', 'slug' => 'ai-tests', 'status' => 'active', 'plan' => 'business']);
        $this->actor = User::factory()->create(['company_id' => $company->id, 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($this->actor, 'sanctum');
    }

    private function input(): array
    {
        return ['prompt' => 'Creează două întrebări din material.', 'test_brief' => [
            'topic' => 'Energie', 'language' => 'ro', 'question_count' => 2, 'difficulty' => 'easy',
            'question_type' => 'multiple_choice', 'source' => 'text',
            'material' => 'Echipamentul consumă 100 J și livrează 80 J utili. Eficiența este 80%, iar pierderile sunt 20 J.',
        ]];
    }

    private function testResponse(): array
    {
        return ['title' => 'Energie', 'needs_more_context' => false, 'questions' => [
            ['question' => 'Care este energia utilă?', 'options' => ['80 J', '100 J', '20 J', '60 J'], 'correct_answer' => 0, 'explanation' => 'Materialul precizează 80 J utili.'],
            ['question' => 'Câtă energie se pierde?', 'options' => ['20 J', '80 J', '100 J', '40 J'], 'correct_answer' => 0, 'explanation' => '100 J minus 80 J înseamnă 20 J pierduți.'],
        ]];
    }

    private function provider(array $body): array
    {
        return ['choices' => [['message' => ['content' => json_encode($body)], 'finish_reason' => 'stop']]];
    }

    public function test_validated_test_is_returned_and_charged_once_without_saving_a_draft(): void
    {
        Http::fake(fn () => Http::response($this->provider($this->testResponse())));
        $response = $this->postJson('/api/admin/ai/generate-test', $this->input())->assertOk()->assertJsonPath('response_type', 'test');
        $this->assertCount(2, json_decode($response->json('content'), true)['questions']);
        $this->assertDatabaseCount('tests', 0);
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 3]);
        Http::assertSentCount(1);
    }

    public function test_invalid_answer_options_are_corrected_before_charging(): void
    {
        $invalid = $this->testResponse();
        $invalid['questions'][0]['options'][1] = '80 J';
        Http::fakeSequence()->push($this->provider($invalid))->push($this->provider($this->testResponse()));
        $this->postJson('/api/admin/ai/generate-test', $this->input())->assertOk();
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => count($request['messages']) === 4 && str_contains($request['messages'][3]['content'], 'distincte'));
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 3]);
    }

    public function test_unusable_test_does_not_consume_credits(): void
    {
        Http::fake(fn () => Http::response($this->provider(['title' => 'Incomplet', 'questions' => []])));
        $this->postJson('/api/admin/ai/generate-test', $this->input())->assertUnprocessable()->assertJsonValidationErrors('ai_response');
        Http::assertSentCount(3);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 3]);
    }

    public function test_provider_failure_does_not_consume_credits(): void
    {
        Http::fake(fn () => Http::response(['error' => ['message' => 'Unavailable']], 503));
        $this->postJson('/api/admin/ai/generate-test', $this->input())->assertStatus(503);
        Http::assertSentCount(1);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 3]);
    }

    public function test_insufficient_material_is_a_readable_clarification_without_credit_use(): void
    {
        Http::fake(fn () => Http::response($this->provider(['needs_more_context' => true, 'description' => 'Adaugă date despre eficiența echipamentului.', 'questions' => []])));
        $this->postJson('/api/admin/ai/generate-test', $this->input())->assertOk()->assertJsonPath('response_type', 'clarification')->assertJsonPath('ai_usage', null);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 3]);
        Http::assertSentCount(1);
    }

    public function test_course_source_includes_later_lessons_and_canonical_blocks(): void
    {
        $course = Course::factory()->create(['company_id' => $this->actor->company_id, 'teacher_id' => $this->actor->id]);
        Lesson::create(['course_id' => $course->id, 'title' => 'Prima', 'content' => str_repeat('Informația de început. ', 2000), 'order' => 0]);
        $last = Lesson::create(['course_id' => $course->id, 'title' => 'Ultima', 'content' => '', 'order' => 1]);
        ContentBlock::create(['lesson_id' => $last->id, 'type' => 'text', 'source' => '', 'visible' => true, 'order' => 0, 'payload' => ['content' => '<p>REPER_FINAL: pierderile sunt 20 J.</p>']]);
        Http::fake(fn () => Http::response($this->provider($this->testResponse())));
        $input = $this->input();
        $input['courseId'] = $course->id;
        $input['test_brief']['source'] = 'course';
        $this->postJson('/api/admin/ai/generate-test', $input)->assertOk();
        Http::assertSent(function ($request) {
            $data = json_decode($request['messages'][1]['content'], true);
            return str_contains($data['test_brief']['material'], 'REPER_FINAL') && mb_strlen($data['test_brief']['material']) <= 12000;
        });
    }

    public function test_append_rejects_a_repeated_existing_question(): void
    {
        $test = Test::factory()->create(['company_id' => $this->actor->company_id, 'created_by' => $this->actor->id, 'question_source' => 'direct', 'status' => 'draft']);
        $test->questions()->create(['company_id' => $this->actor->company_id, 'content' => 'Care este energia utilă?', 'type' => 'multiple_choice', 'answers' => [], 'points' => 1, 'order' => 0]);
        Http::fake(fn () => Http::response($this->provider($this->testResponse())));
        $input = $this->input() + ['testId' => $test->id, 'test_operation' => 'append'];
        $this->postJson('/api/admin/ai/generate-test', $input)->assertUnprocessable();
        $this->assertDatabaseCount('questions', 1);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 3]);
    }

    public function test_instructor_cannot_use_another_instructors_course_as_source(): void
    {
        Http::fake();
        $course = Course::factory()->create(['company_id' => $this->actor->company_id, 'teacher_id' => $this->actor->id]);
        $instructor = User::factory()->create(['company_id' => $this->actor->company_id, 'role' => 'instructor', 'status' => 'active']);
        $this->actingAs($instructor, 'sanctum');
        $this->postJson('/api/admin/ai/generate-test', $this->input() + ['courseId' => $course->id])->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_builder_returns_revision_and_keeps_the_full_unsaved_html_without_applying(): void
    {
        $course = Course::factory()->create(['company_id' => $this->actor->company_id, 'teacher_id' => $this->actor->id]);
        $lesson = Lesson::create(['course_id' => $course->id, 'title' => 'Original', 'content' => '<p>Salvat.</p>', 'order' => 0]);
        $draft = '<h3>Draft nesalvat</h3><p>'.str_repeat('Informație care trebuie păstrată. ', 200).'MARCAJ_FINAL_DRAFT</p>';
        Http::fakeSequence()->push($this->provider(['operations' => [['op' => 'update_lesson', 'lesson_id' => $lesson->id, 'title' => 'Nou']]]))
            ->push($this->provider(['valid' => true]));
        $response = $this->postJson('/api/admin/ai/generate-course', [
            'prompt' => 'Redenumește lecția în Nou.', 'mode' => 'builder_diff', 'courseId' => $course->id,
            'selectedLessonId' => $lesson->id, 'selectedLessonDraft' => ['id' => $lesson->id, 'title' => 'Original', 'content' => $draft],
        ])->assertOk()->assertJsonPath('response_type', 'course');
        $this->assertSame(app(\App\Services\AiCoursePlanService::class)->revision($course->id), $response->json('builder_revision'));
        $this->assertSame('Original', $lesson->fresh()->title);
        Http::assertSent(fn ($request) => str_contains($request['messages'][0]['content'], 'MARCAJ_FINAL_DRAFT') && str_contains($request['messages'][0]['content'], '<h3>Draft nesalvat'));
        Http::assertSentCount(2);
    }

    public function test_question_bank_preview_cannot_read_another_instructors_course(): void
    {
        $this->actor->update(['role' => 'instructor']);
        $other = User::factory()->create(['company_id' => $this->actor->company_id, 'role' => 'instructor']);
        $course = Course::factory()->create(['company_id' => $this->actor->company_id, 'teacher_id' => $other->id]);
        $bank = \App\Models\QuestionBank::create(['company_id' => $this->actor->company_id, 'created_by' => $this->actor->id, 'title' => 'Bancă proprie', 'status' => 'draft']);
        Http::fake();
        $this->postJson('/api/admin/question-banks/'.$bank->id.'/ai/preview', ['course_id' => $course->id])->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_alternative_test_entry_point_uses_the_same_validator_and_credit_cost(): void
    {
        Http::fake(fn () => Http::response($this->provider($this->testResponse())));
        $this->postJson('/api/admin/ai/generate-course', $this->input() + ['type' => 'test'])->assertOk()->assertJsonPath('response_type', 'test');
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 3]);
        Http::assertSentCount(1);
    }
}
