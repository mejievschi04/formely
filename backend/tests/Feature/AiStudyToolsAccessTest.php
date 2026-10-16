<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AiStudyToolsAccessTest extends TestCase
{
    use RefreshDatabase;

    public static function disabledTools(): array
    {
        return array_map(fn ($tool) => [$tool], ['summary', 'explain', 'flashcards', 'quiz', 'study_plan']);
    }

    #[DataProvider('disabledTools')]
    public function test_disabled_learner_tools_do_not_call_the_provider_or_charge(string $tool): void
    {
        config(['ai.enabled' => true, 'ai.provider' => 'openai', 'ai.openai.api_key' => 'test-only']);
        $company = Company::create(['name' => 'Study QA', 'slug' => 'study-qa', 'status' => 'active', 'plan' => 'business']);
        $student = User::factory()->create(['company_id' => $company->id, 'role' => 'student', 'status' => 'active']);
        Http::fake();
        $this->actingAs($student, 'sanctum')->postJson('/api/lessons/1/study-tools', ['tool' => $tool])->assertForbidden();
        Http::assertNothingSent();
        $this->assertDatabaseCount('company_ai_usages', 0);
    }
}
