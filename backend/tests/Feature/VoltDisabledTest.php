<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoltDisabledTest extends TestCase
{
    use RefreshDatabase;

    public function test_ai_routes_do_not_exist_while_ai_is_disabled_even_with_an_api_key(): void
    {
        config(['ai.enabled' => false, 'ai.provider' => 'groq', 'ai.groq.api_key' => 'test-only-secret']);
        $admin = User::factory()->create(['role' => 'admin']);

        foreach ([
            '/api/lessons/1/study-tools',
            '/api/ai/extract-document',
            '/api/admin/question-banks/1/ai/preview',
            '/api/admin/statistics/ai-export',
            '/api/admin/test-results/1/feedback-with-volt',
            '/api/admin/ai/generate-course',
            '/api/admin/ai/generate-test',
        ] as $uri) {
            $this->actingAs($admin, 'sanctum')->postJson($uri, [])->assertNotFound();
        }
    }
}
