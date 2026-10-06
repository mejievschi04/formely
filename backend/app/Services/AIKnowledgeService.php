<?php

namespace App\Services;

use App\Models\AiChunk;
use App\Models\AiEmbedding;
use App\Models\Course;
use App\Models\ContentBlock;
use App\Models\Lesson;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Support\SchemaCache;
use Illuminate\Support\Str;

class AIKnowledgeService
{
    public function getHealthReport(): array
    {
        $embeddingModel = $this->getEmbeddingModel();
        $embeddingUrl = $this->getEmbeddingUrl();
        $sampleVector = $embeddingModel ? $this->getEmbedding('Formely Formely AI knowledge health check') : null;
        $tablesReady = $this->knowledgeTablesReady();

        return [
            'embedding_provider' => $this->getEmbeddingProvider() ?? 'none (căutare pe cuvinte cheie)',
            'embedding_model' => $embeddingModel,
            'embedding_url' => $embeddingUrl,
            'tables_ready' => $tablesReady,
            'embedding_available' => is_array($sampleVector) && !empty($sampleVector),
            'embedding_dimensions' => is_array($sampleVector) ? count($sampleVector) : 0,
            'chunks_count' => $tablesReady ? AiChunk::count() : 0,
            'embeddings_count' => $tablesReady ? AiEmbedding::count() : 0,
            'latest_chunk_at' => $tablesReady ? AiChunk::max('updated_at') : null,
            'latest_embedding_at' => $tablesReady ? AiEmbedding::max('updated_at') : null,
        ];
    }

    public function rebuildLessonIndex(Lesson $lesson, bool $refreshEmbeddings = true): array
    {
        return $this->syncLessonIndex($lesson, $refreshEmbeddings);
    }

    public function syncLessonIndex(Lesson $lesson, bool $refreshEmbeddings = true): array
    {
        if (! $this->knowledgeTablesReady()) {
            return [
                'lesson_id' => $lesson->id,
                'chunks_created' => 0,
                'chunks_updated' => 0,
                'chunks_unchanged' => 0,
                'chunks_deleted' => 0,
                'embeddings_created' => 0,
                'embeddings_updated' => 0,
                'skipped' => true,
            ];
        }

        $lesson->loadMissing([
            'course:id,title,description,level,status',
            'module:id,course_id,title,order',
            'contentBlocks' => function ($query) {
                $query->select('id', 'lesson_id', 'type', 'source', 'payload', 'order', 'visible')
                    ->orderBy('order');
            },
        ]);

        $chunkRows = $this->buildLessonChunks($lesson);
        $existingChunks = AiChunk::query()
            ->where('lesson_id', $lesson->id)
            ->with([
                'embeddings' => function ($query) {
                    $query->where('model', $this->getEmbeddingModel());
                },
            ])
            ->get()
            ->keyBy('content_hash');

        $seenHashes = [];
        $created = 0;
        $updated = 0;
        $unchanged = 0;
        $embeddingsCreated = 0;
        $embeddingsUpdated = 0;

        foreach ($chunkRows as $row) {
            $hash = $row['content_hash'] ?? hash('sha256', (string) ($row['content'] ?? ''));
            $seenHashes[] = $hash;
            $existing = $existingChunks->get($hash);

            if ($existing) {
                $changes = $this->getChunkDiff($existing, $row);
                if (!empty($changes)) {
                    $existing->fill($changes);
                    $existing->save();
                    $updated++;
                } else {
                    $unchanged++;
                }

                if ($refreshEmbeddings) {
                    $embeddingResult = $this->syncEmbeddingForChunk($existing);
                    if ($embeddingResult === 'created') {
                        $embeddingsCreated++;
                    } elseif ($embeddingResult === 'updated') {
                        $embeddingsUpdated++;
                    }
                }
                continue;
            }

            $chunk = AiChunk::create($row);
            $created++;

            if ($refreshEmbeddings) {
                $embeddingResult = $this->syncEmbeddingForChunk($chunk);
                if ($embeddingResult === 'created') {
                    $embeddingsCreated++;
                } elseif ($embeddingResult === 'updated') {
                    $embeddingsUpdated++;
                }
            }
        }

        $staleChunks = AiChunk::query()
            ->where('lesson_id', $lesson->id)
            ->when(!empty($seenHashes), function ($query) use ($seenHashes) {
                $query->whereNotIn('content_hash', $seenHashes);
            }, function ($query) {
                $query->whereRaw('1 = 1');
            })
            ->get();

        if ($staleChunks->isNotEmpty()) {
            $staleIds = $staleChunks->pluck('id')->all();
            AiEmbedding::whereIn('ai_chunk_id', $staleIds)->delete();
            AiChunk::whereIn('id', $staleIds)->delete();
        }

        return [
            'lesson_id' => $lesson->id,
            'chunks_created' => $created,
            'chunks_updated' => $updated,
            'chunks_unchanged' => $unchanged,
            'chunks_deleted' => $staleChunks->count(),
            'embeddings_created' => $embeddingsCreated,
            'embeddings_updated' => $embeddingsUpdated,
        ];
    }

    public function rebuildCourseIndex(Course $course, bool $refreshEmbeddings = true): array
    {
        return $this->syncCourseIndex($course, $refreshEmbeddings);
    }

    public function syncCourseIndex(Course $course, bool $refreshEmbeddings = true): array
    {
        if (! $this->knowledgeTablesReady()) {
            return [
                'course_id' => $course->id,
                'lessons_indexed' => 0,
                'chunks_created' => 0,
                'chunks_updated' => 0,
                'chunks_unchanged' => 0,
                'chunks_deleted' => 0,
                'embeddings_created' => 0,
                'embeddings_updated' => 0,
                'skipped' => true,
            ];
        }

        $course->loadMissing([
            'modules' => function ($query) {
                $query->orderBy('order')->with([
                    'lessons' => function ($lessonQuery) {
                        $lessonQuery->orderBy('order')->with([
                            'contentBlocks' => function ($blockQuery) {
                                $blockQuery->select('id', 'lesson_id', 'type', 'source', 'payload', 'order', 'visible')
                                    ->orderBy('order');
                            },
                        ]);
                    },
                ]);
            },
            'lessons' => function ($query) {
                $query->whereNull('module_id')->orderBy('order')->with([
                    'contentBlocks' => function ($blockQuery) {
                        $blockQuery->select('id', 'lesson_id', 'type', 'source', 'payload', 'order', 'visible')
                            ->orderBy('order');
                    },
                ]);
            },
        ]);

        $lessons = collect($course->lessons ?? collect())
            ->concat(collect($course->modules ?? collect())->flatMap(fn ($module) => $module->lessons ?? collect()))
            ->values();

        $result = [
            'course_id' => $course->id,
            'lessons_indexed' => 0,
            'chunks_created' => 0,
            'chunks_updated' => 0,
            'chunks_unchanged' => 0,
            'chunks_deleted' => 0,
            'embeddings_created' => 0,
            'embeddings_updated' => 0,
        ];

        foreach ($lessons as $lesson) {
            $lessonResult = $this->syncLessonIndex($lesson, $refreshEmbeddings);
            $result['lessons_indexed']++;
            $result['chunks_created'] += $lessonResult['chunks_created'] ?? 0;
            $result['chunks_updated'] += $lessonResult['chunks_updated'] ?? 0;
            $result['chunks_unchanged'] += $lessonResult['chunks_unchanged'] ?? 0;
            $result['chunks_deleted'] += $lessonResult['chunks_deleted'] ?? 0;
            $result['embeddings_created'] += $lessonResult['embeddings_created'] ?? 0;
            $result['embeddings_updated'] += $lessonResult['embeddings_updated'] ?? 0;
        }

        return $result;
    }

    public function deleteLessonIndex(int $lessonId): void
    {
        if (! $this->knowledgeTablesReady()) {
            return;
        }

        $chunkIds = AiChunk::where('lesson_id', $lessonId)->pluck('id')->all();
        if (!empty($chunkIds)) {
            AiEmbedding::whereIn('ai_chunk_id', $chunkIds)->delete();
            AiChunk::whereIn('id', $chunkIds)->delete();
        }
    }

    public function buildLessonChunks(Lesson $lesson): array
    {
        $baseText = $this->buildLessonBaseText($lesson);
        $segments = $this->splitIntoChunks($baseText, 700, 80);
        $rows = [];

        foreach ($segments as $index => $segment) {
            $segment = trim($segment);
            if (mb_strlen($segment) < 100) {
                continue;
            }

            $rows[] = [
                'course_id' => $lesson->course_id,
                'module_id' => $lesson->module_id,
                'lesson_id' => $lesson->id,
                'content_block_id' => null,
                'source_type' => 'lesson_chunk',
                'chunk_index' => (int) $index,
                'token_count' => $this->estimateTokenCount($segment),
                'content' => $segment,
                'content_hash' => hash('sha256', $segment),
                'language' => 'ro',
                'visible' => (bool) ($lesson->visible ?? true),
                'metadata' => [
                    'course_title' => $lesson->course->title ?? null,
                    'module_title' => $lesson->module->title ?? null,
                    'lesson_title' => $lesson->title ?? null,
                    'lesson_updated_at' => optional($lesson->updated_at)->toIso8601String(),
                ],
            ];
        }

        foreach ($this->buildBlockChunks($lesson) as $blockChunk) {
            $rows[] = $blockChunk;
        }

        return $this->deduplicateRows($rows);
    }

    public function rankChunks(string $question, iterable $chunks, int $limit = 8, array $options = []): array
    {
        $questionEmbedding = $this->getEmbedding($question);
        $courseId = isset($options['course_id']) ? (int) $options['course_id'] : null;
        $lessonId = isset($options['lesson_id']) ? (int) $options['lesson_id'] : null;

        $scored = [];
        foreach ($chunks as $chunk) {
            if ($chunk instanceof AiChunk) {
                $chunkData = $chunk->toArray();
            } elseif (is_array($chunk)) {
                $chunkData = $chunk;
            } else {
                continue;
            }

            $content = trim((string) ($chunkData['content'] ?? ''));
            if (mb_strlen($content) < 100) {
                continue;
            }

            $similarity = $this->calculateSimilarity($question, $content, $questionEmbedding, $chunkData);
            $recency = $this->scoreRecency($chunkData['updated_at'] ?? null);
            $lessonMatch = 0.0;
            if ($lessonId && (int) ($chunkData['lesson_id'] ?? 0) === $lessonId) {
                $lessonMatch = 1.0;
            } elseif ($courseId && (int) ($chunkData['course_id'] ?? 0) === $courseId) {
                $lessonMatch = 0.7;
            }

            $finalScore = round(($similarity * 0.7) + ($recency * 0.1) + ($lessonMatch * 0.2), 4);
            if ($finalScore <= 0.15) {
                continue;
            }

            $scored[] = array_merge($chunkData, [
                'score' => $finalScore,
            ]);
        }

        $scored = $this->deduplicateScoredRows($scored);

        usort($scored, function (array $left, array $right) {
            return ($right['score'] ?? 0) <=> ($left['score'] ?? 0);
        });

        return array_slice($scored, 0, max(1, $limit));
    }

    public function contextChunksToPayload(array $chunks): array
    {
        return array_values(array_map(function (array $chunk) {
            return [
                'id' => $chunk['id'] ?? null,
                'text' => $chunk['content'] ?? $chunk['text'] ?? '',
                'lesson_id' => $chunk['lesson_id'] ?? null,
                'course_id' => $chunk['course_id'] ?? null,
                'module_id' => $chunk['module_id'] ?? null,
                'score' => $chunk['score'] ?? 0,
                'source' => $chunk['source_type'] ?? 'lesson_chunk',
            ];
        }, $chunks));
    }

    public function getRankedChunksForTutor(
        string $question,
        ?int $courseId = null,
        ?int $lessonId = null,
        bool $canSeeDrafts = false,
        int $limit = 8
    ): array {
        if (! $this->knowledgeTablesReady()) {
            return [];
        }

        $embeddingModel = $this->getEmbeddingModel();
        $questionEmbedding = $this->getEmbedding($question);

        $query = AiChunk::query()
            ->select([
                'id',
                'course_id',
                'module_id',
                'lesson_id',
                'content_block_id',
                'source_type',
                'chunk_index',
                'token_count',
                'content',
                'content_hash',
                'language',
                'visible',
                'metadata',
                'updated_at',
            ])
            ->with([
                'embeddings' => function ($embeddingQuery) use ($embeddingModel) {
                    $embeddingQuery->select('id', 'ai_chunk_id', 'model', 'dimensions', 'vector', 'vector_hash')
                        ->where('model', $embeddingModel);
                },
            ])
            ->when(!$canSeeDrafts, function ($visibleQuery) {
                $visibleQuery->where('visible', true);
            });

        if ($lessonId) {
            $query->where('lesson_id', $lessonId);
        } elseif ($courseId) {
            $query->where('course_id', $courseId);
        }

        if (!$canSeeDrafts && SchemaCache::hasColumn('courses', 'status')) {
            $query->whereHas('course', function ($courseQuery) {
                $courseQuery->where('status', 'published');
            });
        }

        $tokens = $this->extractTutorSearchTokens($question);
        if ($questionEmbedding === null && !empty($tokens)) {
            $query->where(function ($where) use ($tokens) {
                foreach (array_slice($tokens, 0, 5) as $token) {
                    $where->orWhere('content', 'like', '%' . $token . '%');
                }
            });
        }

        $candidateLimit = $lessonId || $courseId ? max(60, $limit * 20) : 220;
        $chunks = $query
            ->orderByDesc('updated_at')
            ->limit($candidateLimit)
            ->get();

        if ($chunks->isEmpty() && !empty($tokens)) {
            $chunks = AiChunk::query()
                ->select([
                    'id',
                    'course_id',
                    'module_id',
                    'lesson_id',
                    'content_block_id',
                    'source_type',
                    'chunk_index',
                    'token_count',
                    'content',
                    'content_hash',
                    'language',
                    'visible',
                    'metadata',
                    'updated_at',
                ])
                ->with([
                    'embeddings' => function ($embeddingQuery) use ($embeddingModel) {
                        $embeddingQuery->select('id', 'ai_chunk_id', 'model', 'dimensions', 'vector', 'vector_hash')
                            ->where('model', $embeddingModel);
                    },
                ])
                ->when(!$canSeeDrafts, function ($visibleQuery) {
                    $visibleQuery->where('visible', true);
                })
                ->when($lessonId, function ($fallbackQuery) use ($lessonId) {
                    $fallbackQuery->where('lesson_id', $lessonId);
                })
                ->when(!$lessonId && $courseId, function ($fallbackQuery) use ($courseId) {
                    $fallbackQuery->where('course_id', $courseId);
                })
                ->orderByDesc('updated_at')
                ->limit($candidateLimit)
                ->get();
        }

        if ($chunks->isEmpty()) {
            return [];
        }

        $ranked = $this->rankChunks($question, $chunks, $limit, [
            'course_id' => $courseId,
            'lesson_id' => $lessonId,
        ]);

        return $this->contextChunksToPayload($ranked);
    }

    private function buildBlockChunks(Lesson $lesson): array
    {
        $chunks = [];
        $blocks = $lesson->contentBlocks ?? collect();

        foreach ($blocks as $blockIndex => $block) {
            if (!$block instanceof ContentBlock) {
                continue;
            }

            if ($block->visible === false) {
                continue;
            }

            $blockText = trim(implode("\n", array_filter([
                'Block type: ' . (string) ($block->type ?? ''),
                (string) ($block->source ?? ''),
                is_array($block->payload) || is_object($block->payload)
                    ? json_encode($block->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                    : (string) ($block->payload ?? ''),
            ])));

            foreach ($this->splitIntoChunks($blockText, 450, 60) as $chunkIndex => $segment) {
                $segment = trim($segment);
                if (mb_strlen($segment) < 100) {
                    continue;
                }

                $chunks[] = [
                    'course_id' => $lesson->course_id,
                    'module_id' => $lesson->module_id,
                    'lesson_id' => $lesson->id,
                    'content_block_id' => $block->id,
                    'source_type' => 'content_block',
                    'chunk_index' => $blockIndex * 100 + $chunkIndex,
                    'token_count' => $this->estimateTokenCount($segment),
                    'content' => $segment,
                    'content_hash' => hash('sha256', $segment),
                    'language' => 'ro',
                    'visible' => (bool) $block->visible,
                    'metadata' => [
                        'block_type' => $block->type,
                        'lesson_title' => $lesson->title,
                    ],
                ];
            }
        }

        return $chunks;
    }

    private function syncEmbeddingForChunk(AiChunk $chunk): string
    {
        $model = $this->getEmbeddingModel();
        if (!$model) {
            return 'skipped';
        }

        $existingEmbedding = $chunk->embeddings()
            ->where('model', $model)
            ->first();

        if ($existingEmbedding && $existingEmbedding->vector_hash === hash('sha256', json_encode($existingEmbedding->vector))) {
            return 'unchanged';
        }

        $vector = $this->getEmbedding($chunk->content);
        if (empty($vector)) {
            return 'skipped';
        }

        AiEmbedding::updateOrCreate(
            [
                'ai_chunk_id' => $chunk->id,
                'model' => $model,
            ],
            [
                'dimensions' => count($vector),
                'vector' => $vector,
                'vector_hash' => hash('sha256', json_encode($vector)),
            ]
        );

        return $existingEmbedding ? 'updated' : 'created';
    }

    private function getEmbedding(string $text): ?array
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        $cacheKey = 'ai_embedding:' . hash('sha256', $this->getEmbeddingModel() . '|' . $text);
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $url = $this->getEmbeddingUrl();
        $model = $this->getEmbeddingModel();
        if (!$url || !$model) {
            return null;
        }

        try {
            $headers = ['Content-Type' => 'application/json'];
            $apiKey = $this->getEmbeddingApiKey();
            if ($apiKey) {
                $headers['Authorization'] = 'Bearer ' . $apiKey;
            }

            $response = Http::withHeaders($headers)
                ->timeout(60)
                ->post($url, [
                    'model' => $model,
                    'input' => $text,
                ]);

            if (!$response->successful()) {
                Log::warning('Embedding request failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'model' => $model,
                ]);
                return null;
            }

            $data = $response->json();
            $vector = $data['data'][0]['embedding'] ?? $data['embedding'] ?? null;
            if (!is_array($vector) || empty($vector)) {
                return null;
            }

            Cache::put($cacheKey, $vector, now()->addHours(6));
            return $vector;
        } catch (ConnectionException $e) {
            Log::warning('Embedding connection failed', [
                'model' => $model,
                'error' => $e->getMessage(),
            ]);
            return null;
        } catch (\Throwable $e) {
            Log::warning('Embedding generation failed', [
                'model' => $model,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Furnizorul de embedding-uri sau null dacă nu există unul utilizabil.
     * Groq nu oferă embedding-uri: fără AI_EMBEDDING_PROVIDER, ele sunt active doar cu AI_PROVIDER=openai.
     */
    private function getEmbeddingProvider(): ?string
    {
        $provider = strtolower(trim((string) config('ai.embedding.provider', '')));
        if ($provider === '') {
            $provider = strtolower((string) config('ai.provider', 'groq')) === 'openai' ? 'openai' : '';
        }

        return match ($provider) {
            'openai' => 'openai',
            '', 'none', 'groq' => null,
            default => 'custom',
        };
    }

    private function getEmbeddingUrl(): ?string
    {
        $provider = $this->getEmbeddingProvider();
        if ($provider === 'openai') {
            return rtrim((string) config('ai.openai.api_url', 'https://api.openai.com/v1'), '/') . '/embeddings';
        }

        if ($provider === 'custom') {
            $custom = trim((string) config('ai.embedding.api_url', ''));
            return $custom !== '' ? rtrim($custom, '/') : null;
        }

        return null;
    }

    private function getEmbeddingModel(): ?string
    {
        $provider = $this->getEmbeddingProvider();
        $model = trim((string) config('ai.embedding.model', ''));
        if ($provider === 'openai') {
            return $model !== '' ? $model : (string) config('ai.embedding.openai_model', 'text-embedding-3-small');
        }

        if ($provider === 'custom') {
            return $model !== '' ? $model : null;
        }

        return null;
    }

    private function getEmbeddingApiKey(): ?string
    {
        $key = trim((string) config('ai.embedding.api_key', ''));
        if ($key !== '') {
            return $key;
        }

        return $this->getEmbeddingProvider() === 'openai'
            ? ((string) config('ai.openai.api_key', '') ?: null)
            : null;
    }

    private function calculateSimilarity(string $question, string $content, ?array $questionEmbedding = null, array $chunk = []): float
    {
        $questionTokens = $this->tokenize($question);
        $contentTokens = $this->tokenize($content);

        if (empty($questionTokens) || empty($contentTokens)) {
            return 0.0;
        }

        $overlap = count(array_intersect($questionTokens, $contentTokens));
        $lexical = $overlap / max(1, min(count($questionTokens), count($contentTokens)));

        $exactBoost = str_contains($this->normalize($content), $this->normalize($question)) ? 0.25 : 0.0;

        $embeddingScore = 0.0;
        $chunkEmbedding = $this->getChunkEmbedding($chunk);
        if ($questionEmbedding && $chunkEmbedding) {
            $embeddingScore = (1.0 + $this->cosineSimilarity($questionEmbedding, $chunkEmbedding)) / 2.0;
        }

        if ($questionEmbedding && $chunkEmbedding) {
            return min(1.0, ($lexical * 0.25) + ($embeddingScore * 0.65) + $exactBoost);
        }

        return min(1.0, ($lexical * 0.8) + $exactBoost);
    }

    private function getChunkEmbedding(array $chunk): ?array
    {
        $vector = $chunk['embedding'] ?? null;
        if (is_array($vector) && !empty($vector)) {
            return $vector;
        }

        $embedding = $chunk['embeddings'][0]['vector'] ?? null;
        if (is_array($embedding) && !empty($embedding)) {
            return $embedding;
        }

        return null;
    }

    private function cosineSimilarity(array $a, array $b): float
    {
        $length = min(count($a), count($b));
        if ($length === 0) {
            return 0.0;
        }

        $dot = 0.0;
        $magA = 0.0;
        $magB = 0.0;

        for ($i = 0; $i < $length; $i++) {
            $av = (float) $a[$i];
            $bv = (float) $b[$i];
            $dot += $av * $bv;
            $magA += $av * $av;
            $magB += $bv * $bv;
        }

        if ($magA <= 0 || $magB <= 0) {
            return 0.0;
        }

        return max(-1.0, min(1.0, $dot / (sqrt($magA) * sqrt($magB))));
    }

    private function scoreRecency(?string $updatedAt): float
    {
        if (!$updatedAt) {
            return 0.5;
        }

        $timestamp = strtotime($updatedAt);
        if ($timestamp === false) {
            return 0.5;
        }

        $days = max(0, (time() - $timestamp) / 86400);
        return max(0.0, 1.0 - min(1.0, $days / 365));
    }

    private function splitIntoChunks(string $text, int $chunkSize = 700, int $overlap = 80): array
    {
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)) ?? $text);
        if ($text === '') {
            return [];
        }

        $length = mb_strlen($text);
        if ($length <= $chunkSize) {
            return [$text];
        }

        $chunks = [];
        $step = max(1, $chunkSize - $overlap);
        for ($i = 0; $i < $length; $i += $step) {
            $chunk = trim(mb_substr($text, $i, $chunkSize));
            if ($chunk !== '') {
                $chunks[] = $chunk;
            }

            if ($i + $chunkSize >= $length) {
                break;
            }
        }

        return $chunks;
    }

    private function buildLessonBaseText(Lesson $lesson): string
    {
        return trim(implode("\n", array_filter([
            'Course: ' . (string) ($lesson->course->title ?? ''),
            'Course description: ' . (string) ($lesson->course->description ?? ''),
            'Module: ' . (string) ($lesson->module->title ?? ''),
            'Lesson: ' . (string) ($lesson->title ?? ''),
            (string) ($lesson->content ?? ''),
            $this->extractBlockText($lesson->contentBlocks ?? collect()),
        ])));
    }

    private function extractBlockText(Collection $blocks): string
    {
        $parts = [];
        foreach ($blocks as $block) {
            if (!$block instanceof ContentBlock || $block->visible === false) {
                continue;
            }

            $parts[] = (string) ($block->source ?? '');

            $payload = $block->payload;
            if (is_array($payload) || is_object($payload)) {
                $parts[] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
            } elseif (is_string($payload)) {
                $parts[] = $payload;
            }
        }

        return trim(implode(' ', array_filter($parts)));
    }

    private function tokenize(string $text): array
    {
        $normalized = $this->normalize($text);
        $parts = array_values(array_filter(preg_split('/\s+/u', $normalized) ?: []));

        $stopWords = [
            'si', 'sau', 'dar', 'despre', 'care', 'este', 'sunt', 'cum', 'unde', 'cand',
            'what', 'which', 'the', 'and', 'for', 'with', 'course', 'curs', 'cursuri',
            'lectia', 'lectii', 'lecția', 'lecții', 'platforma', 'platformei', 'ce', 'cum',
        ];

        $tokens = [];
        foreach ($parts as $part) {
            if (mb_strlen($part) < 4 || in_array($part, $stopWords, true)) {
                continue;
            }

            $tokens[] = $part;
        }

        return array_values(array_unique($tokens));
    }

    private function extractTutorSearchTokens(string $text): array
    {
        $normalized = $this->normalize($text);
        $parts = array_values(array_filter(preg_split('/\s+/u', $normalized) ?: []));

        $tokens = [];
        foreach ($parts as $part) {
            if (mb_strlen($part) < 4) {
                continue;
            }

            $tokens[] = $part;
        }

        return array_values(array_unique(array_slice($tokens, 0, 8)));
    }

    private function normalize(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = Str::ascii($value);
        $value = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $value) ?? $value;
        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }

    private function estimateTokenCount(string $text): int
    {
        return max(1, (int) ceil(mb_strlen($text) / 4));
    }

    private function deduplicateRows(array $rows): array
    {
        $seen = [];
        $deduped = [];

        foreach ($rows as $row) {
            $hash = $row['content_hash'] ?? hash('sha256', (string) ($row['content'] ?? ''));
            if (isset($seen[$hash])) {
                continue;
            }

            $seen[$hash] = true;
            $deduped[] = $row;
        }

        return $deduped;
    }

    private function deduplicateScoredRows(array $rows): array
    {
        $seen = [];
        $deduped = [];

        foreach ($rows as $row) {
            $hash = $row['content_hash'] ?? hash('sha256', (string) ($row['content'] ?? ''));
            if (isset($seen[$hash])) {
                continue;
            }

            $seen[$hash] = true;
            $deduped[] = $row;
        }

        return $deduped;
    }

    private function getChunkDiff(AiChunk $existing, array $row): array
    {
        $diff = [];
        foreach ([
            'course_id',
            'module_id',
            'lesson_id',
            'content_block_id',
            'source_type',
            'chunk_index',
            'token_count',
            'content',
            'content_hash',
            'language',
            'visible',
            'metadata',
        ] as $field) {
            $newValue = $row[$field] ?? null;
            $existingValue = $existing->getAttribute($field);

            if ($field === 'metadata') {
                $newValue = is_array($newValue) ? $newValue : [];
                $existingValue = is_array($existingValue) ? $existingValue : [];
                if ($newValue != $existingValue) {
                    $diff[$field] = $newValue;
                }
                continue;
            }

            if ($newValue !== null && $newValue != $existingValue) {
                $diff[$field] = $newValue;
            }
        }

        return $diff;
    }

    private function knowledgeTablesReady(): bool
    {
        try {
            return SchemaCache::hasTable('ai_chunks') && SchemaCache::hasTable('ai_embeddings');
        } catch (\Throwable $e) {
            Log::warning('Formely AI knowledge table check failed', [
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
