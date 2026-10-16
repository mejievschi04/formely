<?php

namespace Tests\Feature;

use App\Jobs\GenerateAiCourseStep;
use App\Models\AiCourseGeneration;
use App\Models\Company;
use App\Models\User;
use App\Services\StagedAiCourseGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class StagedAiCourseGenerationTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;
    private $realQueue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->realQueue = Queue::getFacadeRoot();
        Queue::fake();
        config(['ai.enabled' => true, 'ai.provider' => 'openai', 'ai.openai.api_key' => 'test-only', 'ai.openai.api_url' => 'https://ai.example.test/v1']);
        Http::preventStrayRequests();
        $company = Company::create(['name' => 'Staged test', 'slug' => 'staged-test', 'status' => 'active', 'plan' => 'business']);
        $this->actor = User::factory()->create(['company_id' => $company->id, 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($this->actor, 'sanctum');
    }

    private function input(): array
    {
        return ['request_key' => (string) Str::uuid(), 'prompt' => 'Creează un curs de comunicare.', 'guided_brief' => [
            'topic' => 'Comunicare', 'target_audience' => 'Angajați noi', 'level' => 'incepator', 'style' => 'practic',
            'lesson_size' => 'scurt', 'language' => 'ro', 'modules_count' => 2, 'lessons_per_module' => 2, 'evaluation' => 'none',
        ]];
    }

    private function start(?array $input = null): AiCourseGeneration
    {
        $id = $this->postJson('/api/admin/ai/course-generations', $input ?? $this->input())->assertStatus(202)->json('generation_id');
        return AiCourseGeneration::findOrFail($id);
    }

    private function outline(): array
    {
        return ['title' => 'Comunicare în echipă', 'description' => 'Feedback aplicabil.', 'modules' => array_map(fn ($i) => [
            'title' => 'Modul '.$i, 'lessons' => array_map(fn ($j) => ['title' => "Lecția {$i}.{$j}", 'goal' => 'Oferă feedback concret.', 'kind' => 'procedure'], [1, 2]),
        ], [1, 2])];
    }

    private function lesson(string $title): array
    {
        $explanation = $title.': feedbackul descrie un comportament observabil și efectul lui asupra activității echipei.';
        $example = 'De exemplu, raportul transmis fără cifrele de vânzări a întârziat verificarea bugetului.';
        $application = 'Rescrie observația despre raport astfel încât colegul să poată identifica acțiunea necesară.';
        $feedback = 'Un răspuns potrivit precizează datele lipsă și termenul convenit pentru completarea lor.';
        $content = '<h3>'.$title.'</h3><p>'.$explanation.' '.str_repeat('Descrie situația concretă și explică legătura dintre acțiunea observată și consecința pentru colegi. ', 14).'</p><p>'.$example.'</p><p>'.$application.'</p><p>'.$feedback.'</p>';
        return ['content' => $content, 'evidence' => compact('explanation', 'example', 'application', 'feedback')];
    }

    private function fakeProvider(): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $data = json_decode($request['messages'][1]['content'], true);
            $body = isset($data['selected_lesson']) ? $this->lesson($data['selected_lesson']['title']) : $this->outline();
            return Http::response(['choices' => [['message' => ['content' => json_encode($body)], 'finish_reason' => 'stop']]]);
        });
    }

    private function step(AiCourseGeneration $run): void
    {
        $run->refresh();
        (new GenerateAiCourseStep($run->id, $run->outline === null ? -1 : $run->completed_lessons))->handle(app(StagedAiCourseGenerator::class));
    }

    public function test_only_final_stage_saves_and_charges_once_and_duplicate_jobs_do_nothing(): void
    {
        $this->fakeProvider();
        $run = $this->start();
        for ($i = 0; $i < 5; $i++) {
            $this->step($run);
            $this->assertDatabaseCount('courses', 0);
        }
        $this->assertSame(4, $run->fresh()->completed_lessons);
        $this->step($run);
        $this->assertSame('completed', $run->fresh()->status);
        $this->assertDatabaseCount('courses', 1);
        $this->assertDatabaseCount('lessons', 4);
        $this->assertDatabaseHas('courses', ['company_id' => $this->actor->company_id, 'teacher_id' => $this->actor->id, 'status' => 'draft']);
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 15]);
        $this->step($run);
        (new GenerateAiCourseStep($run->id, 0))->handle(app(StagedAiCourseGenerator::class));
        $this->assertDatabaseCount('courses', 1);
        Http::assertSentCount(5);
    }

    public function test_real_provider_responses_complete_and_save_all_three_course_sizes(): void
    {
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/ai-course-generation-live.json')), true, 512, JSON_THROW_ON_ERROR);
        foreach ($fixture['cases'] as $index => $case) {
            Http::swap(new \Illuminate\Http\Client\Factory());
            Http::preventStrayRequests();
            $sequence = Http::fakeSequence();
            foreach ($case['responses'] as $response) {
                $sequence->push(['choices' => [['message' => ['content' => json_encode($response, JSON_UNESCAPED_UNICODE)], 'finish_reason' => 'stop']]]);
            }
            $input = $this->input();
            $input['guided_brief'] = array_replace($input['guided_brief'], $case['brief'], ['lesson_size' => $case['size']]);
            $run = $this->start($input);
            for ($i = 0; $i < 6; $i++) $this->step($run);

            $this->assertSame('completed', $run->fresh()->status, $case['size']);
            $this->assertSame(4, $run->fresh()->completed_lessons);
            $this->assertNull($run->fresh()->error);
            $this->assertDatabaseCount('courses', $index + 1);
            $this->assertDatabaseCount('lessons', ($index + 1) * 4);
            Http::assertSentCount(count($case['responses']));
        }
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 45]);
    }

    public function test_duplicate_starts_return_the_same_run_even_with_different_request_keys(): void
    {
        $input = $this->input();
        $first = $this->start($input);
        $this->assertSame($first->id, $this->start($input)->id);
        $input['request_key'] = (string) Str::uuid();
        $this->assertSame($first->id, $this->start($input)->id);
        $this->assertDatabaseCount('ai_course_generations', 1);
        Queue::assertPushed(GenerateAiCourseStep::class, 1);
        Http::assertNothingSent();
    }

    public function test_key_cannot_be_reused_for_different_input(): void
    {
        $input = $this->input();
        $this->start($input);
        $input['guided_brief']['topic'] = 'Baze de date';
        $this->postJson('/api/admin/ai/course-generations', $input)->assertStatus(409);
    }

    public function test_failed_lesson_retry_preserves_outline_and_finished_lessons(): void
    {
        $this->fakeProvider();
        $run = $this->start();
        $this->step($run);
        $this->step($run);
        $saved = $run->fresh()->lessons;
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(fn () => Http::response(['choices' => [['message' => ['content' => '{"content":"<p>Prea scurt.</p>"}']]]]));
        $job = new GenerateAiCourseStep($run->id, 1);
        try {
            $job->handle(app(StagedAiCourseGenerator::class));
            $this->fail('Short lesson accepted');
        } catch (\RuntimeException $e) {
            $job->failed($e);
        }
        $this->assertSame('failed', $run->fresh()->status);
        $this->assertSame($saved, $run->fresh()->lessons);
        $this->postJson('/api/admin/ai/course-generations/'.$run->id.'/retry')->assertStatus(202);
        $this->fakeProvider();
        $this->step($run);
        $this->assertSame(2, $run->fresh()->completed_lessons);
        $this->assertSame($saved[0], $run->fresh()->lessons[0]);
        $this->assertDatabaseCount('courses', 0);
    }

    public function test_short_lesson_is_corrected_with_its_draft_before_checkpointing(): void
    {
        $attempts = 0;
        $short = $this->lesson('Feedback');
        $short['content'] = '<p>Feedbackul trebuie explicat printr-un exemplu concret.</p>';
        Http::fake(function ($request) use (&$attempts, $short) {
            $data = json_decode($request['messages'][1]['content'], true);
            if (!isset($data['selected_lesson'])) {
                $body = $this->outline();
            } else {
                $body = ++$attempts === 1 ? $short : $this->lesson($data['selected_lesson']['title']);
                $this->assertSame(0, AiCourseGeneration::first()->completed_lessons);
            }
            return Http::response(['choices' => [['message' => ['content' => json_encode($body)]]]]);
        });
        $run = $this->start();
        $this->step($run);
        $this->step($run);

        $this->assertSame(2, $attempts);
        $this->assertSame(1, $run->fresh()->completed_lessons);
        $this->assertNull($run->fresh()->error);
        $this->assertDatabaseCount('courses', 0);
        Queue::assertPushed(GenerateAiCourseStep::class, 3);
        Http::assertSent(function ($request) use ($short) {
            $messages = $request['messages'];
            return count($messages) === 4
                && $messages[2]['role'] === 'assistant'
                && json_decode($messages[2]['content'], true) === $short
                && str_contains($messages[3]['content'], 'minimum 180');
        });
    }

    public function test_invalid_evidence_is_corrected_automatically(): void
    {
        $invalid = $this->lesson('Feedback');
        $invalid['evidence']['example'] = 'Acest exemplu nu există în textul lecției.';
        Http::fakeSequence()
            ->push(['choices' => [['message' => ['content' => json_encode($invalid)]]]])
            ->push(['choices' => [['message' => ['content' => json_encode($this->lesson('Feedback'))]]]]);
        $content = app(StagedAiCourseGenerator::class)->generateLesson($this->input() + ['selected_lesson' => ['title' => 'Feedback']]);
        $this->assertStringContainsString('raportul transmis', $content);
        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => str_contains($r['messages'][3]['content'] ?? '', 'evidence.example'));
    }

    public function test_quality_corrections_are_bounded_and_never_save_invalid_content(): void
    {
        $this->fakeProvider();
        $run = $this->start();
        $this->step($run);
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(fn () => Http::response(['choices' => [['message' => ['content' => '{"content":"<p>Prea scurt.</p>","evidence":{}}']]]]));
        try {
            $this->step($run);
            $this->fail('Invalid lesson accepted');
        } catch (\App\Exceptions\AiLessonQualityException $e) {
            $this->assertStringContainsString('minimum 180', $e->getMessage());
        }
        Http::assertSentCount(3);
        $this->assertSame(0, $run->fresh()->completed_lessons);
        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 15]);
    }

    public function test_provider_errors_do_not_trigger_content_correction_requests(): void
    {
        Http::fake(fn () => Http::response([], 429));
        try {
            app(StagedAiCourseGenerator::class)->generateLesson($this->input());
            $this->fail('Provider error swallowed');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('HTTP 429', $e->getMessage());
        }
        Http::assertSentCount(1);
    }

    public function test_structured_lesson_is_assembled_without_model_generated_evidence(): void
    {
        $legacy = $this->lesson('Feedback');
        $sections = ['explanation' => $legacy['content']];
        foreach (['example', 'application', 'feedback'] as $part) {
            $sections[$part] = '<p>'.$legacy['evidence'][$part].'</p>';
        }
        $sections['example'] .= '<script>alert(1)</script>';
        Http::fake(fn () => Http::response(['choices' => [['message' => ['content' => json_encode(['sections' => $sections])]]]]));
        $content = app(StagedAiCourseGenerator::class)->generateLesson($this->input());
        $this->assertStringContainsString($legacy['evidence']['feedback'], $content);
        $this->assertStringNotContainsString('<script', $content);
        $this->assertStringNotContainsString('"sections"', $content);
        Http::assertSentCount(1);
    }

    public function test_missing_structured_feedback_is_rejected_even_if_other_sections_are_long(): void
    {
        $sections = ['explanation' => $this->lesson('Feedback')['content'],
            'example' => '<p>Demonstrația arată concret cum poate fi îmbunătățit raportul.</p>',
            'application' => '<p>Rescrie raportul pentru a include datele de vânzări lipsă.</p>'];
        $this->expectException(\App\Exceptions\AiLessonQualityException::class);
        $this->expectExceptionMessage('sections.feedback');
        app(\App\Services\AiLessonQuality::class)->validate(['sections' => $sections], 'scurt', []);
    }

    public function test_real_provider_lesson_with_unclosed_code_blocks_is_rejected(): void
    {
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/ai-course-generation-live.json')), true, 512, JSON_THROW_ON_ERROR);
        $this->expectException(\App\Exceptions\AiLessonQualityException::class);
        $this->expectExceptionMessage('blocurile <pre><code>');
        app(\App\Services\AiLessonQuality::class)->validate($fixture['invalid_code_lesson'], 'mediu', []);
    }

    public function test_run_and_retry_are_private_to_the_actor_and_company(): void
    {
        $run = $this->start();
        $otherCompany = Company::create(['name' => 'Other', 'slug' => 'other-staged', 'status' => 'active', 'plan' => 'business']);
        $this->actingAs(User::factory()->create(['company_id' => $otherCompany->id, 'role' => 'admin']), 'sanctum');
        $this->getJson('/api/admin/ai/course-generations/'.$run->id)->assertNotFound();
        $this->postJson('/api/admin/ai/course-generations/'.$run->id.'/retry')->assertNotFound();
        $this->getJson('/api/admin/ai/course-generations/active')->assertOk()->assertJsonPath('generation', null);
    }

    public function test_final_save_and_quota_failure_leave_no_partial_course(): void
    {
        $this->fakeProvider();
        $run = $this->start();
        for ($i = 0; $i < 5; $i++) $this->step($run);
        $this->mock(\App\Services\AiQuotaGate::class, function ($mock) {
            $mock->shouldReceive('recordSuccess')->once()->andThrow(new \RuntimeException('Quota changed'));
        });
        try {
            $this->step($run);
            $this->fail('Quota exception was swallowed');
        } catch (\RuntimeException $e) {
            $this->assertSame('Quota changed', $e->getMessage());
        }
        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseCount('modules', 0);
        $this->assertDatabaseCount('lessons', 0);
        $this->assertSame(4, $run->fresh()->completed_lessons);
    }

    public function test_changing_only_the_title_cannot_hide_duplicate_lesson_content(): void
    {
        $lesson = $this->lesson('Feedback');
        $copy = $lesson;
        $copy['content'] = str_replace('<h3>Feedback</h3>', '<h3>Alt titlu</h3>', $copy['content']);
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('repetă integral');
        app(\App\Services\AiLessonQuality::class)->validate($copy, 'scurt', [$lesson]);
    }

    public function test_evidence_must_exist_in_content_and_unsafe_html_is_removed(): void
    {
        $quality = app(\App\Services\AiLessonQuality::class);
        $lesson = $this->lesson('Feedback');
        $lesson['content'] .= '<script>alert(1)</script><p onclick="alert(2)" style="display:none">Text sigur.</p>';
        $content = $quality->validate($lesson, 'scurt', []);
        $this->assertStringNotContainsString('<script', $content);
        $this->assertStringNotContainsString('onclick', $content);
        $this->assertStringNotContainsString('style=', $content);
        $lesson['evidence']['example'] = 'Acest exemplu inventat nu există în lecția generată.';
        $this->expectException(\RuntimeException::class);
        $quality->validate($lesson, 'scurt', []);
    }

    public function test_evidence_matches_visible_text_across_html_boundaries_and_unicode_spaces(): void
    {
        $lesson = $this->lesson('Feedback');
        $example = $lesson['evidence']['example'];
        $lesson['content'] = str_replace($example,
            'De&nbsp;exemplu,<br>raportul transmis</p><ul><li>fără cifrele de vânzări</li><li>a întârziat verificarea bugetului.</li></ul><p>',
            $lesson['content']);
        $lesson['evidence']['application'] = str_replace(' ', "\u{202F}", $lesson['evidence']['application']);

        $this->assertNotEmpty(app(\App\Services\AiLessonQuality::class)->validate($lesson, 'scurt', []));
    }

    public function test_evidence_matches_words_split_by_inline_formatting(): void
    {
        $lesson = $this->lesson('Feedback');
        $lesson['content'] = str_replace('raportul transmis', '<strong>raport</strong>ul <em>transmis</em>', $lesson['content']);

        $this->assertNotEmpty(app(\App\Services\AiLessonQuality::class)->validate($lesson, 'scurt', []));
    }

    public function test_literal_html_in_evidence_is_preserved_and_checked_in_full(): void
    {
        $lesson = $this->lesson('HTML');
        $example = 'Exemplul folosește <button>Salvează</button> pentru a confirma modificările.';
        $lesson['content'] = str_replace($lesson['evidence']['example'], htmlspecialchars($example, ENT_QUOTES, 'UTF-8'), $lesson['content']);
        $lesson['evidence']['example'] = $example;
        $quality = app(\App\Services\AiLessonQuality::class);
        $this->assertNotEmpty($quality->validate($lesson, 'scurt', []));

        $lesson['evidence']['example'] = str_replace('button', 'input', $example);
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('example');
        $quality->validate($lesson, 'scurt', []);
    }

    public function test_invalid_content_type_has_an_actionable_validation_error(): void
    {
        $lesson = $this->lesson('Feedback');
        $lesson['content'] = ['html' => $lesson['content']];
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('content trebuie să fie HTML text');
        app(\App\Services\AiLessonQuality::class)->validate($lesson, 'scurt', []);
    }

    public function test_invalid_evidence_type_is_rejected_without_a_php_warning(): void
    {
        $lesson = $this->lesson('Feedback');
        $lesson['evidence']['example'] = ['text' => $lesson['evidence']['example']];
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('example');
        app(\App\Services\AiLessonQuality::class)->validate($lesson, 'scurt', []);
    }

    public function test_database_queue_runs_every_stage_and_commits_the_next_job_with_its_checkpoint(): void
    {
        Queue::swap($this->realQueue);
        $this->fakeProvider();
        $run = $this->start();
        for ($i = 0; $i < 6; $i++) {
            $job = Queue::connection('database')->pop();
            $this->assertNotNull($job, 'Missing queued stage '.$i);
            $job->fire();
            $job->delete();
        }
        $this->assertSame('completed', $run->fresh()->status);
        $this->assertDatabaseCount('courses', 1);
        $this->assertDatabaseCount('jobs', 0);
        Http::assertSentCount(5);
    }

    public function test_retry_cannot_start_a_second_concurrent_generation(): void
    {
        $first = $this->start();
        $first->update(['status' => 'failed']);
        $secondInput = $this->input();
        $secondInput['guided_brief']['topic'] = 'Alt curs';
        $second = $this->start($secondInput);
        $this->postJson('/api/admin/ai/course-generations/'.$first->id.'/retry')->assertStatus(409);
        $this->assertSame('queued', $second->fresh()->status);
    }

    public function test_old_failed_runs_do_not_reappear_after_a_newer_course_is_completed(): void
    {
        $first = $this->start();
        $first->update(['status' => 'failed']);
        $second = $this->start();
        $second->update(['status' => 'completed', 'result' => ['course_id' => 42]]);
        $this->getJson('/api/admin/ai/course-generations/active')->assertOk()->assertJsonPath('generation', null);
    }
}
