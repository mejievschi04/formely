<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AiCourseGenerationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        config(['ai.enabled' => true, 'ai.provider' => 'openai', 'ai.openai.api_key' => 'test-only', 'ai.openai.api_url' => 'https://ai.example.test/v1']);
        Http::preventStrayRequests();
        $company = Company::create(['name' => 'Test academy', 'slug' => 'generation-test', 'status' => 'active', 'plan' => 'business']);
        $this->actingAs(User::factory()->create(['company_id' => $company->id, 'role' => 'admin']), 'sanctum');
    }

    private function requestBody(): array
    {
        return ['prompt' => 'Creează cursul din brief.', 'type' => 'course', 'mode' => 'guided_creation:full', 'guided_brief' => [
            'topic' => 'Comunicare', 'target_audience' => 'Angajați noi', 'level' => 'incepator', 'style' => 'practic',
            'lesson_size' => 'scurt', 'language' => 'ro', 'modules_count' => 2, 'lessons_per_module' => 2, 'evaluation' => 'none',
        ]];
    }

    private function fakeCourse(string $content): void
    {
        $course = ['response_type' => 'course', 'title' => 'Comunicare în echipă', 'description' => 'Feedback clar și aplicabil.', 'modules' => array_map(fn ($i) => [
            'title' => 'Modul '.$i, 'lessons' => array_map(fn ($j) => ['title' => "Lecție {$i}.{$j}", 'content' => $content], [1, 2]),
        ], [1, 2])];
        Http::fake(['https://ai.example.test/v1/chat/completions' => Http::response(['choices' => [['message' => ['content' => json_encode($course)]]]])]);
    }

    public function test_complete_course_is_saved_and_charged_once(): void
    {
        $this->fakeCourse(str_repeat('<p>Explicația dezvoltă un mecanism concret și arată cum se verifică rezultatul în practică.</p>', 12));
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())->assertOk()->assertJsonPath('response_type', 'course');
        $this->assertDatabaseCount('courses', 1);
        $this->assertDatabaseCount('modules', 2);
        $this->assertDatabaseCount('lessons', 4);
        $this->assertDatabaseHas('company_ai_usages', ['action' => 'credits', 'used' => 15]);
        Http::assertSentCount(1);
    }

    public function test_short_provider_output_is_rejected_before_any_course_is_created(): void
    {
        $this->fakeCourse('<p>Comunicarea este importantă.</p>');
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())->assertUnprocessable()->assertJsonValidationErrors('ai_response');
        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseCount('modules', 0);
        $this->assertDatabaseCount('lessons', 0);
        $this->assertDatabaseMissing('company_ai_usages', ['action' => 'credits', 'used' => 15]);
    }

    public function test_developed_prose_does_not_require_artificial_line_breaks(): void
    {
        // Intentionally few sentences/HTML blocks, but enough explanatory text.
        $content = '<p>'.implode(' ', array_fill(0, 40, 'Explicația descrie mecanismul și justifică fiecare decizie prin efectele asupra rezultatului')).'.</p>';
        $this->fakeCourse($content);
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())->assertOk()->assertJsonPath('response_type', 'course');
        $this->assertDatabaseCount('courses', 1);
        $this->assertDatabaseCount('lessons', 4);
        Http::assertSentCount(1);
    }

    public function test_failed_lesson_save_rolls_back_the_whole_course(): void
    {
        $this->fakeCourse(str_repeat('<p>Explicația dezvoltă un mecanism concret și arată cum se verifică rezultatul în practică.</p>', 12));
        $this->mock(\App\Services\CourseBuilderService::class, function ($mock) {
            $mock->makePartial();
            $mock->shouldReceive('createLesson')->andThrow(new \RuntimeException('Synthetic persistence failure'));
        });
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())->assertStatus(500);
        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseCount('modules', 0);
        $this->assertDatabaseCount('lessons', 0);
        Http::assertSentCount(1);
    }

    public function test_truncated_course_returns_actionable_validation_error_without_saving(): void
    {
        Http::fake(['https://ai.example.test/v1/chat/completions' => Http::response([
            'choices' => [['message' => ['content' => '{"response_type":"course","modules":['], 'finish_reason' => 'length']],
        ])]);
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())
            ->assertUnprocessable()->assertJsonValidationErrors('ai_response');
        $this->assertDatabaseCount('courses', 0);
        Http::assertSentCount(3);
    }

    public function test_incomplete_form_returns_field_errors_without_contacting_the_provider(): void
    {
        Http::fake();
        $request = $this->requestBody();
        unset($request['guided_brief']['target_audience']);
        $this->postJson('/api/admin/ai/generate-course', $request)->assertUnprocessable()->assertJsonValidationErrors('guided_brief.target_audience');
        Http::assertNothingSent();
    }

    public function test_quota_exhausted_during_generation_rolls_back_the_course(): void
    {
        $this->fakeCourse(str_repeat('<p>Explicația dezvoltă un mecanism concret și arată cum se verifică rezultatul în practică.</p>', 12));
        $this->mock(\App\Services\AiQuotaGate::class, function ($mock) {
            $mock->shouldReceive('assertAvailable')->once();
            $mock->shouldReceive('recordSuccess')->once()->andThrow(new \Illuminate\Http\Exceptions\HttpResponseException(
                response()->json(['error' => 'Credite epuizate.', 'code' => 'ai_quota_exceeded'], 429)
            ));
        });
        $this->postJson('/api/admin/ai/generate-course', $this->requestBody())->assertStatus(429);
        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseCount('modules', 0);
        $this->assertDatabaseCount('lessons', 0);
        Http::assertSentCount(1);
    }

    public function test_provider_must_respect_requested_module_count(): void
    {
        $this->fakeCourse(str_repeat('<p>Explicația dezvoltă un mecanism concret și arată cum se verifică rezultatul în practică.</p>', 12));
        $request = $this->requestBody();
        $request['guided_brief']['modules_count'] = 3;
        $this->postJson('/api/admin/ai/generate-course', $request)->assertUnprocessable()->assertJsonValidationErrors('ai_response');
        $this->assertDatabaseCount('courses', 0);
    }

    public function test_provider_must_respect_requested_lessons_per_module(): void
    {
        $this->fakeCourse(str_repeat('<p>Explicația dezvoltă un mecanism concret și arată cum se verifică rezultatul în practică.</p>', 12));
        $request = $this->requestBody();
        $request['guided_brief']['lessons_per_module'] = 3;
        $this->postJson('/api/admin/ai/generate-course', $request)->assertUnprocessable()->assertJsonValidationErrors('ai_response');
        $this->assertDatabaseCount('courses', 0);
    }

    public function test_deleted_course_is_not_silently_replaced_with_a_new_one(): void
    {
        Http::fake();
        $request = $this->requestBody();
        $request['courseId'] = 999999;
        $this->postJson('/api/admin/ai/generate-course', $request)->assertNotFound();
        $this->assertDatabaseCount('courses', 0);
        Http::assertNothingSent();
    }
}
