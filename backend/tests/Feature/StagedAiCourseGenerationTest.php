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
