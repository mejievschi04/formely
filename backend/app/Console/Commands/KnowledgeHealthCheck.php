<?php

namespace App\Console\Commands;

use App\Services\AIKnowledgeService;
use Illuminate\Console\Command;

class KnowledgeHealthCheck extends Command
{
    protected $signature = 'ai:knowledge-health {--json : Output machine-readable JSON}';
    protected $description = 'Check Formely AI knowledge index and embedding health.';

    public function handle(AIKnowledgeService $service): int
    {
        $report = $service->getHealthReport();

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            return $report['embedding_available'] ? self::SUCCESS : self::FAILURE;
        }

        $this->info('Formely AI knowledge health');
        $this->line('Embedding provider: ' . ($report['embedding_provider'] ?? 'unknown'));
        $this->line('Embedding model: ' . ($report['embedding_model'] ?? 'unknown'));
        $this->line('Embedding URL: ' . ($report['embedding_url'] ?? 'n/a'));
        $this->line('Embedding available: ' . (($report['embedding_available'] ?? false) ? 'yes' : 'no'));
        $this->line('Embedding dimensions: ' . (int) ($report['embedding_dimensions'] ?? 0));
        $this->line('Chunks count: ' . (int) ($report['chunks_count'] ?? 0));
        $this->line('Embeddings count: ' . (int) ($report['embeddings_count'] ?? 0));
        $this->line('Latest chunk updated: ' . ($report['latest_chunk_at'] ?? 'n/a'));
        $this->line('Latest embedding updated: ' . ($report['latest_embedding_at'] ?? 'n/a'));

        if (!($report['embedding_available'] ?? false)) {
            $this->warn('Embeddings are not reachable. Formely AI Assistant will fall back to lexical ranking.');
            return self::FAILURE;
        }

        $this->info('Knowledge indexing looks healthy.');
        return self::SUCCESS;
    }
}



