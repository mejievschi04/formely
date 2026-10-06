<?php

namespace Tests\Feature;

use App\Services\AIKnowledgeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiEmbeddingProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_groq_has_no_embeddings_and_sends_no_request(): void
    {
        config(['ai.provider' => 'groq', 'ai.groq.api_key' => 'test-key', 'ai.embedding.provider' => null]);
        Http::fake();

        $report = app(AIKnowledgeService::class)->getHealthReport();

        $this->assertNull($report['embedding_model']);
        $this->assertNull($report['embedding_url']);
        $this->assertFalse($report['embedding_available']);
        Http::assertNothingSent();
    }

    public function test_openai_uses_its_embedding_endpoint(): void
    {
        config([
            'ai.provider' => 'openai',
            'ai.openai.api_key' => 'test-key',
            'ai.openai.api_url' => 'https://api.openai.com/v1',
            'ai.embedding.provider' => null,
        ]);
        Http::fake(['*' => Http::response(['data' => [['embedding' => [0.1, 0.2, 0.3]]]])]);

        $report = app(AIKnowledgeService::class)->getHealthReport();

        $this->assertSame('text-embedding-3-small', $report['embedding_model']);
        $this->assertSame('https://api.openai.com/v1/embeddings', $report['embedding_url']);
        $this->assertSame(3, $report['embedding_dimensions']);
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer test-key'));
    }

    public function test_custom_provider_uses_configured_url_and_model(): void
    {
        config([
            'ai.provider' => 'groq',
            'ai.embedding.provider' => 'custom',
            'ai.embedding.api_url' => 'http://localhost:11434/v1/embeddings',
            'ai.embedding.model' => 'nomic-embed-text',
        ]);
        Http::fake(['*' => Http::response(['data' => [['embedding' => [0.5, 0.5]]]])]);

        $report = app(AIKnowledgeService::class)->getHealthReport();

        $this->assertSame('nomic-embed-text', $report['embedding_model']);
        $this->assertSame('http://localhost:11434/v1/embeddings', $report['embedding_url']);
        $this->assertTrue($report['embedding_available']);
    }
}
