<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\Test;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class QuestionAdminController extends Controller
{
    /**
     * Move selected questions to another question bank (folder).
     */
    public function bulkMove(Request $request)
    {
        $validated = $request->validate([
            'question_ids' => 'required|array|min:1',
            'question_ids.*' => 'integer',
            'target_bank_id' => 'required|integer|exists:question_banks,id',
        ]);

        $targetBank = QuestionBank::findOrFail((int) $validated['target_bank_id']);
        if (auth()->user()->isInstructor() && (int) $targetBank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $questions = Question::query()
            ->whereIn('id', $validated['question_ids'])
            ->get();

        if ($questions->count() !== count($validated['question_ids'])) {
            return response()->json([
                'error' => 'Unele întrebări selectate nu există.',
            ], 422);
        }

        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            foreach ($questions as $q) {
                $allowed = false;
                if ($q->question_bank_id) {
                    $qb = QuestionBank::find((int) $q->question_bank_id);
                    $allowed = $qb && (int) $qb->created_by === $uid;
                } elseif ($q->test_id) {
                    $t = Test::find((int) $q->test_id);
                    $allowed = $t && (int) $t->created_by === $uid;
                }
                if (!$allowed) {
                    abort(403, 'Acces interzis.');
                }
            }
        }

        $lastOrder = (int) Question::where('question_bank_id', $targetBank->id)->max('order');
        $startOrder = max(0, $lastOrder + 1);

        DB::transaction(function () use ($questions, $targetBank, $startOrder) {
            foreach ($questions->values() as $idx => $q) {
                $q->update([
                    'question_bank_id' => $targetBank->id,
                    'test_id' => null,
                    'order' => $startOrder + $idx,
                ]);
            }
        });

        return response()->json([
            'message' => 'Întrebările au fost mutate în folderul selectat.',
            'moved' => $questions->count(),
        ]);
    }

    /**
     * List questions globally for admin question hub.
     */
    public function index(Request $request)
    {
        $query = Question::query()
            ->with([
                'questionBank:id,title,status,created_by',
                'test:id,title,created_by',
            ])
            ->orderByDesc('id');

        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            $query->where(function ($q) use ($uid) {
                $q->whereHas('test', function ($qt) use ($uid) {
                    $qt->where('created_by', $uid);
                })->orWhereHas('questionBank', function ($qb) use ($uid) {
                    $qb->where('created_by', $uid);
                });
            });
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where('content', 'like', '%' . $search . '%');
        }

        if ($request->filled('type')) {
            $query->where('type', trim((string) $request->type));
        }

        if ($request->filled('difficulty')) {
            $query->where('metadata->difficulty', trim((string) $request->difficulty));
        }

        if ($request->filled('tag')) {
            $tag = trim((string) $request->tag);
            $query->whereJsonContains('metadata->tags', $tag);
        }

        if ($request->filled('question_bank_id')) {
            $query->where('question_bank_id', (int) $request->question_bank_id);
        }
        if ((int) $request->input('without_folder', 0) === 1) {
            $query->whereNull('question_bank_id');
        }
        /** Întrebări legate direct de un test, încă nepuse într-un folder (bancă) */
        if ((int) $request->input('test_attached_no_folder', 0) === 1) {
            $query->whereNull('question_bank_id')->whereNotNull('test_id');
        }
        if ($request->filled('is_starred')) {
            $query->where('is_starred', filter_var($request->is_starred, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('status')) {
            $status = trim((string) $request->status);
            $query->whereHas('questionBank', function ($qb) use ($status) {
                $qb->where('status', $status);
            });
        }

        $perPage = max(1, min((int) $request->input('per_page', 20), 100));
        $questions = $query->paginate($perPage);

        $bankIds = collect($questions->items())
            ->pluck('question_bank_id')
            ->filter()
            ->unique()
            ->values();

        $usageByBank = [];
        if ($bankIds->isNotEmpty()) {
            $tests = Test::query()
                ->select('id', 'title', 'question_set_id')
                ->where('question_source', 'bank')
                ->whereIn('question_set_id', $bankIds->all())
                ->when(auth()->user()->isInstructor(), function ($q) {
                    $q->where('created_by', auth()->id());
                })
                ->get();

            $usageByBank = $tests
                ->groupBy('question_set_id')
                ->map(function ($rows) {
                    return [
                        'count' => $rows->count(),
                        'tests' => $rows->take(5)->map(function ($row) {
                            return [
                                'id' => $row->id,
                                'title' => $row->title,
                            ];
                        })->values()->all(),
                    ];
                })
                ->toArray();
        }

        $questions->getCollection()->transform(function ($question) use ($usageByBank) {
            $meta = is_array($question->metadata) ? $question->metadata : [];
            $difficulty = is_string($meta['difficulty'] ?? null) ? $meta['difficulty'] : null;
            $tags = is_array($meta['tags'] ?? null) ? array_values(array_filter($meta['tags'])) : [];

            $usage = [
                'count' => 0,
                'tests' => [],
                'source' => null,
            ];

            if ($question->question_bank_id) {
                $usageInfo = $usageByBank[$question->question_bank_id] ?? ['count' => 0, 'tests' => []];
                $usage = [
                    'count' => (int) ($usageInfo['count'] ?? 0),
                    'tests' => $usageInfo['tests'] ?? [],
                    'source' => 'bank',
                ];
            } elseif ($question->test_id && $question->test) {
                $usage = [
                    'count' => 1,
                    'tests' => [[
                        'id' => $question->test->id,
                        'title' => $question->test->title,
                    ]],
                    'source' => 'direct',
                ];
            }

            $question->setAttribute('difficulty', $difficulty);
            $question->setAttribute('tags', $tags);
            $question->setAttribute('usage', $usage);
            return $question;
        });

        return response()->json($questions);
    }

    /**
     * Return distinct tags for filtering/suggestions.
     */
    public function tagSuggestions(Request $request)
    {
        $query = Question::query()->whereNotNull('metadata');

        if (auth()->user()->isInstructor()) {
            $uid = (int) auth()->id();
            $query->where(function ($q) use ($uid) {
                $q->whereHas('test', function ($qt) use ($uid) {
                    $qt->where('created_by', $uid);
                })->orWhereHas('questionBank', function ($qb) use ($uid) {
                    $qb->where('created_by', $uid);
                });
            });
        }

        $items = $query->get(['metadata']);
        $tags = [];
        foreach ($items as $item) {
            $meta = is_array($item->metadata) ? $item->metadata : [];
            $list = is_array($meta['tags'] ?? null) ? $meta['tags'] : [];
            foreach ($list as $tag) {
                $t = trim((string) $tag);
                if ($t !== '') {
                    $tags[$t] = true;
                }
            }
        }

        $all = array_keys($tags);
        sort($all);
        $search = trim((string) $request->input('search', ''));
        if ($search !== '') {
            $all = array_values(array_filter($all, function ($tag) use ($search) {
                return mb_stripos($tag, $search) !== false;
            }));
        }

        return response()->json(['tags' => array_slice($all, 0, 100)]);
    }

    /**
     * Update a question (test question or question bank question).
     */
    public function update(Request $request, int $id)
    {
        $question = Question::with(['test', 'questionBank'])->findOrFail($id);
        if (auth()->user()->isInstructor()) {
            $ok = ($question->test_id && $question->test && (int) $question->test->created_by === (int) auth()->id())
                || ($question->question_bank_id && $question->questionBank && (int) $question->questionBank->created_by === (int) auth()->id());
            if (!$ok) {
                abort(403, 'Acces interzis.');
            }
        }

        $validated = $request->validate([
            'type' => 'sometimes|required|string',
            'content' => 'sometimes|nullable|string',
            'answers' => 'sometimes|array',
            'points' => 'nullable|integer|min:0',
            'order' => 'nullable|integer|min:0',
            'explanation' => 'nullable|string',
            'metadata' => 'nullable|array',
            'is_starred' => 'nullable|boolean',
        ]);

        // questions.content is NOT NULL in schema; never persist null.
        if (array_key_exists('content', $validated) && $validated['content'] === null) {
            unset($validated['content']);
        }

        if (array_key_exists('answers', $validated) && is_array($validated['answers'])) {
            $questionType = (string) ($validated['type'] ?? $question->type ?? 'multiple_choice');
            $validated['answers'] = $this->normalizeAnswersForType($questionType, $validated['answers']);
        }

        try {
            $question->update($validated);
        } catch (QueryException $e) {
            $sqlState = $e->errorInfo[0] ?? '';
            $msg = strtolower($e->getMessage());
            $looksLikeTypeColumn = str_contains($msg, "column 'type'")
                || str_contains($msg, 'column `type`')
                || str_contains($msg, 'questions_type_allowed')
                || str_contains($msg, 'questions_type_check');
            $sqliteTypeCheck = $sqlState === '23000'
                && str_contains($msg, 'check constraint')
                && (str_contains($msg, 'failed: type') || str_contains($msg, 'constraint failed: type'));
            $sqliteContentNull = $sqlState === '23000'
                && str_contains($msg, 'not null constraint failed')
                && str_contains($msg, 'questions.content');
            if ($sqlState === '23514' || $looksLikeTypeColumn || $sqliteTypeCheck || $sqliteContentNull) {
                Log::warning('Question update failed (schema/constraint)', [
                    'question_id' => $id,
                    'driver' => Schema::getConnection()->getDriverName(),
                    'message' => $e->getMessage(),
                ]);

                $hint = 'Rulează migrările: php artisan migrate (inclusiv migrarea SQLite/PostgreSQL pentru tipul single_choice).';
                if ($sqliteContentNull) {
                    $hint = 'Textul întrebării nu poate fi gol. Completează enunțul sau evită să trimiți câmpul content gol.';
                }

                return response()->json([
                    'message' => $sqliteContentNull
                        ? 'Conținutul întrebării este obligatoriu.'
                        : 'Tipul sau datele întrebării nu sunt acceptate de schema bazei de date. '.$hint,
                    'error' => config('app.debug') ? $e->getMessage() : null,
                ], 422);
            }
            throw $e;
        }

        if ($question->test_id) {
            $this->autoDistributePointsIfNoManual((int) $question->test_id);
        }

        return response()->json($question->fresh());
    }

    public function toggleStar(int $id)
    {
        $question = Question::with(['test', 'questionBank'])->findOrFail($id);
        if (auth()->user()->isInstructor()) {
            $ok = ($question->test_id && $question->test && (int) $question->test->created_by === (int) auth()->id())
                || ($question->question_bank_id && $question->questionBank && (int) $question->questionBank->created_by === (int) auth()->id());
            if (!$ok) {
                abort(403, 'Acces interzis.');
            }
        }

        $question->is_starred = !$question->is_starred;
        $question->save();

        return response()->json([
            'message' => $question->is_starred ? 'Întrebarea a fost marcată cu stea.' : 'Steaua a fost eliminată.',
            'question' => $question->fresh(),
        ]);
    }

    /**
     * Delete a question.
     */
    public function destroy(int $id)
    {
        $question = Question::with(['test', 'questionBank'])->findOrFail($id);
        if (auth()->user()->isInstructor()) {
            $ok = ($question->test_id && $question->test && (int) $question->test->created_by === (int) auth()->id())
                || ($question->question_bank_id && $question->questionBank && (int) $question->questionBank->created_by === (int) auth()->id());
            if (!$ok) {
                abort(403, 'Acces interzis.');
            }
        }
        if ($question->question_bank_id) {
            $inUseCount = Test::query()
                ->where('question_source', 'bank')
                ->where('question_set_id', (int) $question->question_bank_id)
                ->count();
            if ($inUseCount > 0) {
                return response()->json([
                    'error' => 'Întrebarea nu poate fi ștearsă deoarece banca este folosită în teste active.',
                    'usage_count' => $inUseCount,
                ], 422);
            }
        }
        $testId = $question->test_id ? (int) $question->test_id : null;
        $question->delete();
        if ($testId) {
            $this->autoDistributePointsIfNoManual($testId);
        }

        return response()->json([
            'message' => 'Question deleted successfully',
        ]);
    }

    /**
     * Dacă niciuna dintre întrebările testului nu are punctaj manual, distribuie 100 puncte egal.
     */
    protected function autoDistributePointsIfNoManual(int $testId): void
    {
        $questions = Question::where('test_id', $testId)->orderBy('order')->get(['id', 'points']);
        $count = $questions->count();
        if ($count === 0) {
            return;
        }

        $hasManualPoints = $questions->contains(function ($q) {
            return $q->points !== null && $q->points !== '';
        });

        if ($hasManualPoints) {
            return;
        }

        DB::transaction(function () use ($questions, $count) {
            if ($count > 100) {
                foreach ($questions as $q) {
                    Question::where('id', $q->id)->update(['points' => 1]);
                }
                return;
            }

            $base = intdiv(100, $count);
            $remainder = 100 - ($base * $count);
            foreach ($questions->values() as $idx => $q) {
                $points = $base + ($idx < $remainder ? 1 : 0);
                Question::where('id', $q->id)->update(['points' => $points]);
            }
        });
    }

    private function normalizeAnswersForType(string $questionType, array $answers): array
    {
        $type = strtolower(trim($questionType));
        $normalized = [];

        foreach (array_values($answers) as $idx => $item) {
            $row = is_array($item) ? $item : [];

            if ($type === 'matching') {
                $left = $row['left'] ?? $row['text'] ?? $row['question'] ?? '';
                $right = $row['right'] ?? $row['answer_text'] ?? $row['content'] ?? '';
                $left = is_string($left) ? $left : (string) $left;
                $right = is_string($right) ? $right : (string) $right;

                $normalized[] = [
                    'left' => $left,
                    'right' => $right,
                    'text' => $left,
                    'answer_text' => $right,
                    'is_correct' => true,
                    'order' => $idx,
                ];
                continue;
            }

            if ($type === 'ordering') {
                $text = $row['text'] ?? $row['answer_text'] ?? $row['content'] ?? $row['label'] ?? '';
                $normalized[] = [
                    'text' => is_string($text) ? $text : (string) $text,
                    'is_correct' => true,
                    'order' => $idx,
                ];
                continue;
            }

            $text = $row['text'] ?? $row['answer_text'] ?? $row['content'] ?? '';
            $normalized[] = [
                'text' => is_string($text) ? $text : (string) $text,
                'is_correct' => filter_var($row['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'order' => isset($row['order']) ? (int) $row['order'] : $idx,
            ];
        }

        return $normalized;
    }

    public function improveWithAi(Request $request, int $id)
    {
        $question = Question::with(['test', 'questionBank'])->findOrFail($id);
        if (auth()->user()->isInstructor()) {
            $ok = ($question->test_id && $question->test && (int) $question->test->created_by === (int) auth()->id())
                || ($question->question_bank_id && $question->questionBank && (int) $question->questionBank->created_by === (int) auth()->id());
            if (!$ok) {
                abort(403, 'Acces interzis.');
            }
        }

        $validated = $request->validate([
            'instruction' => 'nullable|string|max:1000',
        ]);

        $instruction = trim((string) ($validated['instruction'] ?? ''));
        $prompt = "Îmbunătățește următoarea întrebare pentru claritate pedagogică, fără să schimbi subiectul. Răspunde DOAR JSON valid în format:\n";
        $prompt .= "{\"content\":\"...\",\"answers\":[{\"text\":\"...\",\"is_correct\":true}],\"explanation\":\"...\",\"difficulty\":\"easy|medium|hard\",\"tags\":[\"...\"]}\n\n";
        $prompt .= "Întrebare curentă:\n" . json_encode([
            'type' => $question->type,
            'content' => $question->content,
            'answers' => $question->answers,
            'explanation' => $question->explanation,
            'metadata' => $question->metadata,
        ], JSON_UNESCAPED_UNICODE);
        if ($instruction !== '') {
            $prompt .= "\nInstrucțiune suplimentară: {$instruction}";
        }

        $raw = $this->callAi($prompt);
        $data = $this->decodeJsonObject($raw);
        if (!$data) {
            return response()->json(['error' => 'Răspuns AI invalid pentru improve.'], 422);
        }

        return response()->json([
            'draft' => [
                'content' => (string) ($data['content'] ?? $question->content),
                'answers' => is_array($data['answers'] ?? null) ? $data['answers'] : ($question->answers ?? []),
                'explanation' => (string) ($data['explanation'] ?? ($question->explanation ?? '')),
                'metadata' => [
                    'difficulty' => (string) ($data['difficulty'] ?? (($question->metadata['difficulty'] ?? '') ?: '')),
                    'tags' => is_array($data['tags'] ?? null) ? $data['tags'] : (is_array($question->metadata['tags'] ?? null) ? $question->metadata['tags'] : []),
                ],
            ],
        ]);
    }

    public function autoTagWithAi(int $id)
    {
        $question = Question::with(['test', 'questionBank'])->findOrFail($id);
        if (auth()->user()->isInstructor()) {
            $ok = ($question->test_id && $question->test && (int) $question->test->created_by === (int) auth()->id())
                || ($question->question_bank_id && $question->questionBank && (int) $question->questionBank->created_by === (int) auth()->id());
            if (!$ok) {
                abort(403, 'Acces interzis.');
            }
        }

        $prompt = "Generează 3-6 tag-uri scurte pentru întrebarea de mai jos. Răspunde strict JSON: {\"tags\":[\"tag1\",\"tag2\"]}\n\n";
        $prompt .= json_encode([
            'type' => $question->type,
            'content' => $question->content,
            'answers' => $question->answers,
            'explanation' => $question->explanation,
        ], JSON_UNESCAPED_UNICODE);

        $raw = $this->callAi($prompt);
        $data = $this->decodeJsonObject($raw);
        if (!$data || !is_array($data['tags'] ?? null)) {
            return response()->json(['error' => 'Răspuns AI invalid pentru auto-tag.'], 422);
        }

        $tags = array_values(array_unique(array_filter(array_map(function ($t) {
            return trim((string) $t);
        }, $data['tags']))));

        return response()->json(['tags' => $tags]);
    }

    private function decodeJsonObject(string $response): ?array
    {
        $jsonPattern = '/\{[\s\S]*\}/';
        if (preg_match($jsonPattern, $response, $matches)) {
            $parsed = json_decode($matches[0], true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                return $parsed;
            }
        }

        $parsed = json_decode($response, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
            return $parsed;
        }

        return null;
    }

    private function callAi(string $prompt): string
    {
        $provider = (string) config('ai.provider', 'groq');
        if ($provider === 'groq') {
            $apiKey = (string) config('ai.groq.api_key', '');
            $apiUrl = (string) config('ai.groq.api_url', 'https://api.groq.com/openai/v1');
            $model = (string) config('ai.groq.model', 'llama-3.1-8b-instant');
        } else {
            $apiKey = (string) config('ai.openai.api_key', '');
            $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
            $model = (string) config('ai.openai.model', 'gpt-4o-mini');
        }

        $requiresApiKey = true;
        if ($requiresApiKey && !$apiKey) {
            $openaiKey = (string) config('ai.openai.api_key', '');
            if ($provider === 'groq' && $openaiKey !== '') {
                $provider = 'openai';
                $apiKey = $openaiKey;
                $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
                $model = (string) config('ai.openai.model', 'gpt-4o-mini');
            } else {
                throw new \Exception('AI API key not configured for provider: ' . $provider);
            }
        }

        $verify = (bool) config('ai.verify_ssl', true);
        $headers = [
            'Content-Type' => 'application/json',
        ];
        if (!empty($apiKey)) {
            $headers['Authorization'] = "Bearer {$apiKey}";
        }

        $response = Http::withHeaders($headers)->withOptions([
            'verify' => $verify,
        ])->timeout(120)->post("{$apiUrl}/chat/completions", [
            'model' => $model,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'Ești un asistent AI educațional. Folosești STRICT informația din contextul trimis (storage intern), fără web/external knowledge. Dacă informația nu este suficientă, răspunzi cu JSON valid și explici că este nevoie de context suplimentar.',
                ],
                [
                    'role' => 'user',
                    'content' => $prompt,
                ],
            ],
            'temperature' => 0.4,
            'max_tokens' => 1600,
        ]);

        if (!$response->successful()) {
            Log::error('AI API Error (QuestionAdminController)', [
                'status' => $response->status(),
                'error' => $response->body(),
            ]);
            throw new \Exception('AI API error: ' . $response->status());
        }

        $data = $response->json();
        return $data['choices'][0]['message']['content'] ?? '';
    }
}
