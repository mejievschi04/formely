<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Models\Course;
use App\Models\ContentBlock;
use App\Models\Module;
use App\Models\Lesson;
use App\Models\User;
use App\Services\AIKnowledgeService;
use App\Services\CourseBuilderService;
use App\Services\VoltDataInsightService;
use App\Services\VoltPromptService;
use App\Support\LearningVisibility;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Support\SchemaCache;
use Illuminate\Support\Str;
use Illuminate\Http\UploadedFile;

class AIController extends Controller
{
    use \App\Http\Controllers\Concerns\AssertsPlanEntitlements;

    private const DEFAULT_MIN_LESSON_LINES = 10;

    private $apiKey;
    private $apiUrl;
    private $hfApiKey;
    private $hfApiUrl;
    private $model;
    private $provider; // 'openai', 'groq', 'huggingface'
    private $courseBuilderService;
    private AIKnowledgeService $knowledgeService;
    private VoltDataInsightService $dataInsightService;
    
    // Lista de modele Groq în ordinea preferinței (fallback chain)
    private $groqModelFallbackChain = [
        'llama-3.1-8b-instant',         // Rapid și eficient
        'llama-3.3-70b-versatile',      // Înlocuitorul recomandat pentru modelele 70B vechi
    ];
    private $currentModelIndex = 0;

    public function __construct(CourseBuilderService $courseBuilderService, AIKnowledgeService $knowledgeService, VoltDataInsightService $dataInsightService)
    {
        $this->courseBuilderService = $courseBuilderService;
        $this->knowledgeService = $knowledgeService;
        $this->dataInsightService = $dataInsightService;
        
        // Verifică ce provider este configurat
        $this->provider = config('ai.provider', 'groq'); // Default: Groq
        
        $this->initializeProvider($this->provider);
    }

    private function initializeProvider(string $provider): void
    {
        $normalizedProvider = strtolower(trim($provider));
        if (!in_array($normalizedProvider, ['groq', 'openai', 'huggingface'], true)) {
            $normalizedProvider = 'groq';
        }

        $this->provider = $normalizedProvider;
        $this->currentModelIndex = 0;

        switch ($normalizedProvider) {
            case 'openai':
                $this->apiKey = (string) config('ai.openai.api_key', '');
                $this->apiUrl = rtrim((string) config('ai.openai.api_url', 'https://api.openai.com/v1'), '/');
                $this->model = (string) config('ai.openai.model', 'gpt-4o-mini');
                $this->hfApiKey = null;
                $this->hfApiUrl = null;
                break;

            case 'huggingface':
                $this->hfApiKey = (string) config('ai.huggingface.api_key', '');
                $this->hfApiUrl = rtrim((string) config('ai.huggingface.api_url', 'https://router.huggingface.co'), '/');
                $this->model = (string) config('ai.huggingface.model', 'meta-llama/Meta-Llama-3.1-8B-Instruct');
                $this->apiKey = null;
                $this->apiUrl = null;
                break;

            case 'groq':
            default:
                $this->apiKey = (string) config('ai.groq.api_key', '');
                $this->apiUrl = rtrim((string) config('ai.groq.api_url', 'https://api.groq.com/openai/v1'), '/');
                $this->model = (string) (config('ai.groq.creator_model') ?: config('ai.groq.model', 'llama-3.1-8b-instant'));
                $this->groqModelFallbackChain = $this->buildGroqModelFallbackChain();
                $this->hfApiKey = null;
                $this->hfApiUrl = null;
                break;
        }
    }

    private function buildGroqModelFallbackChain(): array
    {
        $configured = [];
        $deprecatedModels = [
            'llama3-8b-8192',
            'gemma2-9b-it',
            'mixtral-8x7b-32768',
        ];

        $primary = trim((string) (config('ai.groq.creator_model') ?: config('ai.groq.model', 'llama-3.1-8b-instant')));
        $quality = trim((string) config('ai.groq.creator_quality_model', ''));
        $fallbackRaw = (string) config('ai.groq.fallback_models', '');
        $fallbackList = array_map('trim', explode(',', $fallbackRaw));

        foreach (array_merge([$primary, $quality], $fallbackList) as $candidate) {
            if ($candidate === '' || in_array($candidate, $configured, true)) {
                continue;
            }
            if (in_array(strtolower($candidate), $deprecatedModels, true)) {
                continue;
            }
            $configured[] = $candidate;
        }

        if (!empty($configured)) {
            return $configured;
        }

        return [
            'llama-3.1-8b-instant',
            'llama-3.3-70b-versatile',
        ];
    }

    private function getMinLessonLines(): int
    {
        return max(1, (int) (config('ai.min_lesson_lines') ?? self::DEFAULT_MIN_LESSON_LINES));
    }
    
    /**
     * Extract text from an uploaded document so Volt can use it as course source.
     */
    public function extractDocumentContext(Request $request)
    {
        if (!$this->canUseTutor()) {
            abort(403, 'Doar administratorii pot folosi Formely AI pentru documente.');
        }

        $validated = $request->validate([
            'file' => 'required|file|max:20480',
        ]);

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $mime = (string) ($file->getMimeType() ?? '');
        $name = (string) $file->getClientOriginalName();
        $type = $this->detectDocumentType($file, $mime);
        $text = $this->extractDocumentText($file, $type, $mime);

        return response()->json([
            'file_name' => $name,
            'mime_type' => $mime ?: null,
            'type' => $type,
            'text' => $text,
            'preview' => Str::limit(trim(strip_tags($text)), 2500, ''),
        ]);
    }

    public function generateCourse(Request $request)
    {
        $requestedType = (string) $request->input('type', 'course');
        $type = in_array($requestedType, ['course', 'tutor', 'test'], true) ? $requestedType : 'course';

        // Formely: fiecare mod AI e inclus doar în anumite planuri.
        $this->assertCompanyFeature(match ($type) {
            'test' => 'ai_test_generation',
            'course' => 'ai_creator',
            default => 'ai_builder',
        });

        return $this->streamResponse($request, $type);
    }

    public function generateTest(Request $request)
    {
        return $this->streamResponse($request, 'test');
    }

    public function generateLessonStudyTool(Request $request, int $lessonId)
    {
        if (!auth()->check()) {
            abort(401);
        }

        if (!$this->apiKey) {
            // 503: serviciul AI nu e disponibil (configurare), nu o eroare a serverului
            return response()->json(['error' => 'Formely AI nu este configurat: lipsește cheia AI.'], 503);
        }

        $validated = $request->validate([
            'tool' => 'required|string|in:summary,explain,flashcards,quiz,study_plan',
        ]);

        $isStaff = auth()->user()?->isAdmin() || auth()->user()?->isInstructor();
        $lessonQuery = Lesson::query()
            ->with([
                'course:id,title,status',
                'module:id,title',
                'contentBlocks' => function ($query) {
                    $query->where(function ($q) {
                        $q->where('visible', true)->orWhereNull('visible');
                    })->orderBy('order');
                },
            ]);

        if (!$isStaff) {
            if (SchemaCache::hasColumn('lessons', 'status')) {
                $lessonQuery->where('status', 'published');
            }
            if (SchemaCache::hasColumn('courses', 'status')) {
                $lessonQuery->whereHas('course', fn ($q) => $q->where('status', 'published'));
            }
        }

        $lesson = $lessonQuery->findOrFail($lessonId);
        $user = auth()->user();
        if (! LearningVisibility::learnerMaySeeLessonBody($user, $lesson, $lesson->course)) {
            return response()->json(['error' => 'Nu ai acces la această lecție.'], 403);
        }
        $lessonText = $this->extractStudyToolLessonText($lesson);

        if (mb_strlen($lessonText) < 80) {
            return response()->json([
                'error' => 'Lecția nu are suficient conținut text pentru Study Tools.',
            ], 422);
        }

        $prompt = $this->buildStudyToolPrompt($lesson, $lessonText, $validated['tool']);

        try {
            $raw = $this->callStudyToolAi($prompt);
            $parsed = $this->decodeStudyToolJson($raw);

            if (!$parsed || !is_array($parsed)) {
                return response()->json(['error' => 'Formely AI nu a returnat un răspuns valid.'], 422);
            }

            return response()->json([
                'tool' => $validated['tool'],
                'lesson_id' => $lesson->id,
                'lesson_title' => $lesson->title,
                'result' => $this->normalizeStudyToolResult($validated['tool'], $parsed),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Lesson study tool generation failed', [
                'lesson_id' => $lesson->id,
                'tool' => $validated['tool'],
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => config('app.debug') ? $e->getMessage() : 'Nu s-a putut genera instrumentul de studiu.',
            ], 500);
        }
    }

    private function canUseTutor(): bool
    {
        $user = auth()->user();

        return $user && ($user->isAdmin() || $user->isInstructor());
    }

    private function determineTutorIntent(string $prompt): string
    {
        $normalizedPrompt = $this->normalizeTutorText($prompt);

        $quizKeywords = ['genereaza', 'generează', 'quiz', 'test', 'intrebari', 'întrebări', 'question'];
        foreach ($quizKeywords as $keyword) {
            if (str_contains($normalizedPrompt, $this->normalizeTutorText($keyword))) {
                return 'quiz';
            }
        }

        $evaluationKeywords = ['evalueaza', 'evaluează', 'corecteaza', 'corectează', 'verifica', 'verifică', 'evaluate'];
        foreach ($evaluationKeywords as $keyword) {
            if (str_contains($normalizedPrompt, $this->normalizeTutorText($keyword))) {
                return 'evaluation';
            }
        }

        return 'answer';
    }

    private function extractLatestUserMessage(array $messages): string
    {
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            $entry = $messages[$i] ?? null;
            if (!is_array($entry)) {
                continue;
            }
            if (($entry['role'] ?? null) !== 'user') {
                continue;
            }
            $content = trim((string) ($entry['content'] ?? ''));
            if ($content !== '') {
                return $content;
            }
        }

        return '';
    }

    private function shouldUseHighQualityCreatorModel(array $messages, string $mode): bool
    {
        if (!str_contains((string) $mode, 'guided_creation')) {
            return false;
        }

        $latestUserPrompt = $this->normalizeTutorText($this->extractLatestUserMessage($messages));
        if ($latestUserPrompt === '') {
            return false;
        }

        $qualityTriggers = [
            'calitate maxima',
            'calitate ridicata',
            'high quality',
            'maximum quality',
            'best quality',
            'quality first',
        ];

        foreach ($qualityTriggers as $trigger) {
            if (str_contains($latestUserPrompt, $this->normalizeTutorText($trigger))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return the next Groq fallback model, or null if none remain.
     */
    private function getNextGroqModel(): ?string
    {
        if (empty($this->groqModelFallbackChain)) {
            return null;
        }

        if (!is_int($this->currentModelIndex) || $this->currentModelIndex < 0) {
            $this->currentModelIndex = 0;
        }

        $nextIndex = $this->currentModelIndex + 1;
        if (!array_key_exists($nextIndex, $this->groqModelFallbackChain)) {
            return null;
        }

        $this->currentModelIndex = $nextIndex;
        return $this->groqModelFallbackChain[$nextIndex];
    }

    /**
     * Detect provider throttling / quota errors so we can retry or fall back.
     */
    private function isRateLimitError(int $statusCode, string $errorBody): bool
    {
        if (in_array($statusCode, [429, 503, 529], true)) {
            return true;
        }

        $normalized = strtolower($errorBody);
        foreach (['rate limit', 'too many requests', 'quota', 'temporarily unavailable', 'slow down'] as $needle) {
            if (str_contains($normalized, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Detect "request too large" errors (HTTP 413) — usually max_tokens exceeds the
     * model's tokens-per-minute (TPM) limit. Falling back to a higher-TPM model fixes it.
     */
    private function isRequestTooLargeError(int $statusCode, string $errorBody): bool
    {
        if ($statusCode === 413) {
            return true;
        }

        $normalized = strtolower($errorBody);
        foreach (['request too large', 'tokens per minute (tpm)', 'reduce the length'] as $needle) {
            if (str_contains($normalized, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Detect unavailable/deprecated model errors so we can fallback.
     */
    private function isModelUnavailableError(int $statusCode, string $errorBody): bool
    {
        $normalized = strtolower($errorBody);
        $mentionsModel = str_contains($normalized, 'model');
        if (!$mentionsModel) {
            return false;
        }

        if ($statusCode === 404 && (
            str_contains($normalized, 'not found') ||
            str_contains($normalized, 'does not exist') ||
            str_contains($normalized, 'no access')
        )) {
            return true;
        }

        if ($statusCode === 400 && (
            str_contains($normalized, 'decommissioned') ||
            str_contains($normalized, 'no longer supported') ||
            str_contains($normalized, 'deprecated')
        )) {
            return true;
        }

        return false;
    }

    private function extractRetryAfterSeconds(string $errorBody, int $fallback = 20): int
    {
        if (preg_match('/retry after\s*([0-9]+)s/i', $errorBody, $matches)) {
            return max(5, (int) ($matches[1] ?? $fallback));
        }

        return $fallback;
    }

    private function looksLikeTruncatedJson(string $content): bool
    {
        $trimmed = trim($content);
        if ($trimmed === '') {
            return false;
        }

        if (str_starts_with($trimmed, '```')) {
            // Fence deschis fără fence de închidere după prima linie => răspuns tăiat.
            return strpos($trimmed, '```', 3) === false;
        }

        return str_starts_with($trimmed, '{') && !str_ends_with($trimmed, '}');
    }

    /**
     * Generate guided course creation without streaming, so we can validate the final JSON before saving.
     */
    private function generateGuidedCourseCreationJson(array $messages, ?int $teacherId = null, ?int $courseId = null, string $mode = ''): array
    {
        $providerName = $this->provider === 'groq' ? 'Groq' : 'OpenAI';
        // Generarea ghidată face mai multe request-uri + backoff la rate limit; poate depăși 30s.
        @set_time_limit(0);
        $useHighQualityCreatorModel = $this->shouldUseHighQualityCreatorModel($messages, $mode);
        $defaultTimeout = max(30, (int) config('ai.timeouts.request', 180));
        $guidedTimeoutRaw = (int) config('ai.timeouts.guided_creation', 0);
        $timeout = $guidedTimeoutRaw <= 0 ? $defaultTimeout : max($defaultTimeout, $guidedTimeoutRaw);
        $connectTimeout = max(5, (int) config('ai.timeouts.connect', 15));
        // Full guided courses need large JSON (2+ modules, 2+ lessons each, long HTML per lesson).
        // Defaults around 1100–1200 truncate output → invalid JSON or validation failure.
        // Plafon dur 8192: multe modele Groq (ex. llama-4-scout) resping max_tokens > 8192 (HTTP 400),
        // iar pe tier-ul gratuit max_tokens + input trebuie să încapă în limita TPM a modelului.
        $maxTokens = max(700, min(8192, (int) config('ai.max_tokens.guided', 8192)));
        if ($maxTokens < 4000) {
            Log::warning("{$providerName} guided course: AI_GUIDED_MAX_TOKENS is low; increase toward 8192 if courses fail to save", [
                'max_tokens' => $maxTokens,
            ]);
        }

        $effectiveModel = $this->model;
        if ($this->provider === 'groq') {
            $effectiveModel = (config('ai.groq.creator_model') ?: $effectiveModel);
            if ($useHighQualityCreatorModel) {
                $effectiveModel = (config('ai.groq.creator_quality_model') ?: $effectiveModel);
            }
        } elseif ($this->provider === 'openai') {
            $effectiveModel = (config('ai.openai.creator_model') ?: $effectiveModel);
            if ($useHighQualityCreatorModel) {
                $effectiveModel = (config('ai.openai.creator_quality_model') ?: $effectiveModel);
            }
        }

        $attemptModels = [$effectiveModel];
        if ($this->provider === 'groq') {
            while (($nextModel = $this->getNextGroqModel()) !== null) {
                if (!in_array($nextModel, $attemptModels, true)) {
                    $attemptModels[] = $nextModel;
                }
            }
        }

        $lastError = null;
        $minRequiredLessonLines = max(1, $this->getMinLessonLines() + 1); // "mai mult de 10" => at least 11
        $autoValidationRetries = 3;

        foreach ($attemptModels as $attemptIndex => $modelToUse) {
            $modelMessages = $messages;

            for ($regenAttempt = 0; $regenAttempt < $autoValidationRetries; $regenAttempt++) {
                $payload = [
                    'model' => $modelToUse,
                    'messages' => $modelMessages,
                    'stream' => false,
                    'temperature' => 0.2,
                    'max_tokens' => $maxTokens,
                    'top_p' => 1,
                ];

                if ($this->provider === 'openai') {
                    $payload['response_format'] = ['type' => 'json_object'];
                }

                try {
                    Log::info("{$providerName} guided course JSON request", [
                        'model' => $modelToUse,
                        'attempt' => $attemptIndex + 1,
                        'regen_attempt' => $regenAttempt + 1,
                        'messages_count' => count($modelMessages),
                    ]);

                    $request = Http::withHeaders([
                        'Content-Type' => 'application/json',
                        'Authorization' => 'Bearer ' . $this->apiKey,
                    ])
                        ->timeout($timeout)
                        ->connectTimeout($connectTimeout)
                        ->withOptions([
                            'verify' => (bool) config('ai.verify_ssl', true),
                        ])
                        ->post("{$this->apiUrl}/chat/completions", $payload);

                    if (!$request->successful()) {
                        $errorBody = $request->body();
                        $statusCode = $request->status();
                        $isModelNotFound = $this->isModelUnavailableError($statusCode, $errorBody);
                        $isRateLimit = $this->isRateLimitError($statusCode, $errorBody);
                        $isRequestTooLarge = $this->isRequestTooLargeError($statusCode, $errorBody);

                        if ($this->provider === 'groq' && ($isModelNotFound || $isRateLimit || $isRequestTooLarge) && $attemptIndex < count($attemptModels) - 1) {
                            Log::warning("{$providerName} guided request retrying with fallback model", [
                                'status' => $statusCode,
                                'model' => $modelToUse,
                                'reason' => $isRequestTooLarge ? 'request_too_large' : ($isModelNotFound ? 'model_not_found' : 'rate_limit'),
                                'error' => substr($errorBody, 0, 300),
                            ]);
                            continue 2;
                        }

                        throw new \Exception("{$providerName} API error: HTTP {$statusCode}. " . substr($errorBody, 0, 200));
                    }

                    $content = data_get($request->json(), 'choices.0.message.content', '');
                    if (!is_string($content) || trim($content) === '') {
                        throw new \Exception("{$providerName} API returned empty course content");
                    }

                    $courseData = $this->extractFirstJsonObjectFromText($content);
                    if (!$courseData) {
                        $fallbackText = trim($content);

                        if ($this->looksLikeTruncatedJson($fallbackText)) {
                            Log::warning("{$providerName} guided course response was truncated; forcing auto-regeneration", [
                                'model' => $modelToUse,
                                'regen_attempt' => $regenAttempt + 1,
                                'response_preview' => substr($fallbackText, 0, 500),
                            ]);

                            if ($regenAttempt < ($autoValidationRetries - 1)) {
                                $modelMessages[] = [
                                    'role' => 'user',
                                    'content' => 'Răspunsul anterior a fost tăiat și JSON-ul este incomplet. Refă TOT cursul ca JSON valid, compact, fără markdown, fără ```json, dar păstrează lecțiile utile și structura completă.',
                                ];
                                continue;
                            }

                            throw new \Exception('Formely AI a generat un JSON incomplet. Încearcă un curs mai mic (ex. 2 module x 2 lecții) sau crește limita AI_GUIDED_MAX_TOKENS.');
                        }

                        $clarificationQuestion = $fallbackText !== ''
                            ? Str::limit(strip_tags($fallbackText), 240, '')
                            : 'Am nevoie de o singură clarificare ca să continui cu cursul.';

                        Log::warning("{$providerName} guided course response was not JSON; returning clarification fallback", [
                            'model' => $modelToUse,
                            'response_preview' => substr($fallbackText, 0, 500),
                        ]);

                        return [
                            'response_type' => 'clarification',
                            'clarification_question' => $clarificationQuestion,
                            'content' => $clarificationQuestion,
                        ];
                    }

                    $responseType = strtolower(trim((string) ($courseData['response_type'] ?? $courseData['type'] ?? '')));
                    if ($responseType === 'clarification') {
                        $clarificationQuestion = trim((string) ($courseData['clarification_question'] ?? $courseData['question'] ?? $courseData['message'] ?? ''));
                        if ($clarificationQuestion === '') {
                            $clarificationQuestion = 'Am nevoie de o singură clarificare ca să continui cu cursul.';
                        }

                        return [
                            'response_type' => 'clarification',
                            'clarification_question' => $clarificationQuestion,
                            'content' => $clarificationQuestion,
                        ];
                    }

                    if ($responseType !== 'course') {
                        $clarificationQuestion = trim((string) ($courseData['clarification_question'] ?? $courseData['question'] ?? $courseData['message'] ?? ''));
                        if ($clarificationQuestion === '') {
                            $clarificationQuestion = 'Am nevoie de o singură clarificare ca să continui cu cursul.';
                        }

                        return [
                            'response_type' => 'clarification',
                            'clarification_question' => $clarificationQuestion,
                            'content' => $clarificationQuestion,
                        ];
                    }

                    $validation = $this->validateAndNormalizeCourseData($courseData);
                    if (!($validation['ok'] ?? false)) {
                        $reasons = $validation['reasons'] ?? [];
                        $detail = $reasons !== []
                            ? 'Validare curs: ' . implode(' ', $reasons)
                            : 'Cursul generat nu a trecut validarea.';

                        Log::warning("{$providerName} guided course validation failed; forcing auto-regeneration", [
                            'model' => $modelToUse,
                            'regen_attempt' => $regenAttempt + 1,
                            'reasons' => $reasons,
                        ]);

                        if ($regenAttempt < ($autoValidationRetries - 1)) {
                            $modelMessages[] = [
                                'role' => 'user',
                                'content' => "Refă TOT cursul în JSON valid. Reguli obligatorii: fiecare lecție trebuie să aibă mai mult de 10 rânduri (minimum {$minRequiredLessonLines} rânduri utile), folosind paragrafe separate <p>, liste <li> și exemple practice. Corectează strict aceste probleme: {$detail}",
                            ];
                            continue;
                        }

                        return [
                            'response_type' => 'clarification',
                            'clarification_question' => $detail . ' Am încercat regenerare automată, dar încă nu a respectat regula de conținut. Dă un topic mai specific ca să detaliez lecțiile.',
                            'content' => $detail,
                        ];
                    }

                    $validated = $validation['data'];
                    $validated['response_type'] = 'course';
                    $validatedJson = json_encode($validated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $createdCourse = $this->createOrUpdateCourseFromResponse($validatedJson, $teacherId, $courseId);
                    if (!$createdCourse) {
                        throw new \Exception('Course could not be created from Formely AI response');
                    }

                    $isUpdate = $courseId !== null;
                    return [
                        'response_type' => 'course',
                        'content' => "\n\n✅ Cursul a fost " . ($isUpdate ? 'actualizat' : 'creat') . " automat în background!\n\n📚 ID: {$createdCourse->id}\n📝 Titlu: {$createdCourse->title}\n📦 Module: " . $createdCourse->modules()->count() . "\n📄 Lecții: " . $createdCourse->lessons()->count() . "\n\nPoți continua conversația sau să îmi spui dacă vrei să modific ceva.",
                        'course_id' => $createdCourse->id,
                        'course_created' => !$isUpdate,
                        'course_updated' => $isUpdate,
                    ];
                } catch (\Throwable $e) {
                    $lastError = $e;
                    Log::warning("{$providerName} guided course JSON attempt failed", [
                        'attempt' => $attemptIndex + 1,
                        'regen_attempt' => $regenAttempt + 1,
                        'model' => $modelToUse,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        throw $lastError ?: new \Exception('Formely AI course generation failed');
    }

    private function shouldUseUltraShortTutorMode(string $prompt, array $tutorContext): bool
    {
        if ($this->isAnalyticsQuestion($prompt)) {
            return false;
        }

        $normalizedPrompt = $this->normalizeTutorText($prompt);
        $wordCount = count(array_filter(preg_split('/\s+/u', $normalizedPrompt) ?: []));

        if (($tutorContext['query_type'] ?? '') === 'catalog') {
            return true;
        }

        if ($wordCount <= 8) {
            return true;
        }

        if ($wordCount <= 12 && empty($tutorContext['matched_lesson']) && empty($tutorContext['matched_course'])) {
            return true;
        }

        return false;
    }

    private function isAnalyticsQuestion(string $prompt): bool
    {
        $normalizedPrompt = $this->normalizeTutorText($prompt);
        $keywords = [
            'statistici',
            'statistic',
            'rata',
            'finalizare',
            'progres',
            'activi',
            'activitate',
            'top ',
            'elevi',
            'studenti',
            'studenți',
            'engagement',
            'risc',
            'export',
            'excel',
            'promovat',
            'promovate',
            'scor',
            'rezultate',
            'inscrieri',
            'înscrieri',
            'sumar',
            'overview',
            'analytics',
            'kpi',
            'watchlist',
        ];

        foreach ($keywords as $keyword) {
            if (str_contains($normalizedPrompt, $this->normalizeTutorText($keyword))) {
                return true;
            }
        }

        return false;
    }

    private function detectDocumentType(UploadedFile $file, string $mime): string
    {
        $name = strtolower((string) $file->getClientOriginalName());

        if (str_ends_with($name, '.docx') || str_contains($mime, 'officedocument.wordprocessingml')) {
            return 'docx';
        }

        if (str_ends_with($name, '.doc') || str_contains($mime, 'msword')) {
            return 'doc';
        }

        if (str_ends_with($name, '.pdf') || $mime === 'application/pdf') {
            return 'pdf';
        }

        if (str_ends_with($name, '.txt') || str_starts_with($mime, 'text/')) {
            return 'txt';
        }

        if (str_ends_with($name, '.csv') || in_array($mime, ['text/csv', 'application/csv', 'application/vnd.ms-excel'], true)) {
            return 'csv';
        }

        return 'file';
    }

    private function extractDocumentText(UploadedFile $file, string $type, string $mime): string
    {
        return match ($type) {
            'txt', 'csv' => (string) @file_get_contents($file->getRealPath()) ?: '',
            'docx' => $this->extractDocxText($file->getRealPath()),
            'pdf' => $this->extractPdfTextBestEffort($file->getRealPath()),
            default => '',
        };
    }

    private function extractDocxText(string $path): string
    {
        if (!class_exists(\ZipArchive::class) || !is_file($path)) {
            return '';
        }

        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }

        $xml = $zip->getFromName('word/document.xml');
        $zip->close();
        if (!$xml) {
            return '';
        }

        $xml = str_replace(['</w:p>', '</w:tr>', '<w:br/>', '<w:br />', '<w:tab/>'], ["\n", "\n", "\n", "\n", "\t"], $xml);
        $text = strip_tags($xml);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8');

        return trim(preg_replace("/\n{3,}/", "\n\n", $text) ?? '');
    }

    private function extractPdfTextBestEffort(string $path): string
    {
        if (!is_file($path)) {
            return '';
        }

        $escaped = escapeshellarg($path);
        $tmpOutput = tempnam(sys_get_temp_dir(), 'volt_pdf_');
        if ($tmpOutput === false) {
            return '';
        }

        $command = sprintf('pdftotext -layout %s %s 2>&1', $escaped, escapeshellarg($tmpOutput));
        $result = @shell_exec($command);
        $text = '';
        if (is_string($result) && trim($result) === '') {
            $text = (string) @file_get_contents($tmpOutput);
        }

        @unlink($tmpOutput);

        if (trim($text) !== '') {
            return trim($text);
        }

        $raw = (string) @file_get_contents($path);
        if ($raw === '') {
            return '';
        }

        $fallback = preg_replace('/[^\P{C}\n\t]+/u', ' ', $raw) ?? '';
        $fallback = preg_replace('/\s{2,}/u', ' ', $fallback) ?? '';

        return trim($fallback);
    }

    private function formatAttachmentContext(array $attachments): string
    {
        $blocks = [];
        foreach (array_slice($attachments, 0, 5) as $index => $attachment) {
            if (!is_array($attachment)) {
                continue;
            }

            $name = (string) ($attachment['file_name'] ?? $attachment['name'] ?? ('Document ' . ($index + 1)));
            $type = (string) ($attachment['type'] ?? $attachment['mime_type'] ?? 'document');
            $preview = (string) ($attachment['preview'] ?? $attachment['text'] ?? '');
            if ($preview === '') {
                continue;
            }

            $cleanPreview = trim(strip_tags($preview));
            $cleanPreview = Str::limit($cleanPreview, 6000, '');
            if ($cleanPreview === '') {
                continue;
            }

            $blocks[] = "Fișier: {$name}\nTip: {$type}\nConținut:\n{$cleanPreview}";
        }

        return $blocks ? implode("\n\n---\n\n", $blocks) : '(fără conținut text extras)';
    }

    /**
     * Build chat-completions messages with a system prompt and clean history.
     */
    private function formatMessages(string $systemPrompt, $messages, ?string $prompt = null): array
    {
        $formatted = [
            [
                'role' => 'system',
                'content' => $systemPrompt,
            ],
        ];

        $history = is_array($messages) ? $messages : [];
        foreach ($history as $message) {
            if (!is_array($message)) {
                continue;
            }

            $role = strtolower(trim((string) ($message['role'] ?? '')));
            $content = trim((string) ($message['content'] ?? ''));
            if ($content === '') {
                continue;
            }

            if (!in_array($role, ['user', 'assistant', 'system'], true)) {
                $role = 'user';
            }

            // We already inject our canonical system prompt above.
            if ($role === 'system') {
                continue;
            }

            $formatted[] = [
                'role' => $role,
                'content' => $content,
            ];
        }

        $promptText = trim((string) ($prompt ?? ''));
        if ($promptText !== '') {
            $lastMessage = end($formatted);
            $lastIsSameUserPrompt = is_array($lastMessage)
                && (($lastMessage['role'] ?? null) === 'user')
                && (($lastMessage['content'] ?? '') === $promptText);

            if (!$lastIsSameUserPrompt) {
                $formatted[] = [
                    'role' => 'user',
                    'content' => $promptText,
                ];
            }
        }

        return $formatted;
    }

    private function normalizeGuidedBrief($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }

        $sanitizeText = static fn ($value): string => trim((string) $value);
        $sanitizeInt = static function ($value, int $fallback, int $min, int $max): int {
            $parsed = filter_var($value, FILTER_VALIDATE_INT);
            if ($parsed === false) {
                return $fallback;
            }

            return max($min, min($max, (int) $parsed));
        };

        $topic = $sanitizeText($raw['topic'] ?? '');
        $courseTitle = $sanitizeText($raw['course_title'] ?? '');
        $description = $sanitizeText($raw['description'] ?? '');
        $targetAudience = $sanitizeText($raw['target_audience'] ?? '');
        $level = $sanitizeText($raw['level'] ?? 'incepator');
        $style = $sanitizeText($raw['style'] ?? 'practic');
        $lessonSize = $sanitizeText($raw['lesson_size'] ?? 'mediu');
        $language = $sanitizeText($raw['language'] ?? 'ro');
        $modulesCount = $sanitizeInt($raw['modules_count'] ?? 3, 3, 2, 12);
        $lessonsPerModule = $sanitizeInt($raw['lessons_per_module'] ?? 2, 2, 2, 8);

        if ($topic === '' && $courseTitle === '' && $description === '') {
            return null;
        }

        return [
            'topic' => $topic,
            'course_title' => $courseTitle,
            'description' => $description,
            'target_audience' => $targetAudience,
            'level' => $level,
            'style' => $style,
            'lesson_size' => $lessonSize,
            'language' => $language,
            'modules_count' => $modulesCount,
            'lessons_per_module' => $lessonsPerModule,
        ];
    }

    private function buildGuidedBriefPrompt(array $brief): string
    {
        return VoltPromptService::buildGuidedBriefPrompt($brief);
    }

    private function extractStudyToolLessonText(Lesson $lesson): string
    {
        $parts = [];

        foreach ($lesson->contentBlocks ?? [] as $block) {
            $payload = is_array($block->payload ?? null) ? $block->payload : [];
            $metadata = is_array($block->metadata ?? null) ? $block->metadata : [];
            $candidates = [
                $payload['content'] ?? null,
                $payload['text'] ?? null,
                $payload['html'] ?? null,
                $payload['description'] ?? null,
                $payload['transcript'] ?? null,
                $payload['instructions'] ?? null,
                $metadata['description'] ?? null,
                $metadata['transcript'] ?? null,
                $block->source ?? null,
            ];

            foreach ($candidates as $candidate) {
                $text = $this->studyToolPlainText($candidate);
                if ($text !== '') {
                    $parts[] = $text;
                }
            }
        }

        $legacyText = $this->studyToolPlainText($lesson->content ?? '');
        if ($legacyText !== '') {
            $parts[] = $legacyText;
        }

        return mb_substr(trim(implode("\n\n", array_unique($parts))), 0, 14000);
    }

    private function studyToolPlainText(mixed $value): string
    {
        if (is_array($value)) {
            $value = implode(' ', array_map(fn ($item) => is_scalar($item) ? (string) $item : json_encode($item, JSON_UNESCAPED_UNICODE), $value));
        }

        if (!is_string($value) || trim($value) === '') {
            return '';
        }

        return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    }

    private function buildStudyToolPrompt(Lesson $lesson, string $lessonText, string $tool): string
    {
        $schemas = [
            'summary' => '{"title":"string","summary":"5-8 propoziții","key_points":["..."],"takeaway":"string"}',
            'explain' => '{"title":"string","simple_explanation":"explicație pe înțelesul unui începător","analogy":"string","steps":["..."],"common_confusions":["..."]}',
            'flashcards' => '{"title":"string","flashcards":[{"front":"întrebare/termen","back":"răspuns/explicație"}]}',
            'quiz' => '{"title":"string","questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}',
            'study_plan' => '{"title":"string","duration_minutes":25,"steps":[{"label":"...","minutes":5,"instruction":"..."}],"review_focus":["..."]}',
        ];

        $toolLabels = [
            'summary' => 'rezumat clar al lecției',
            'explain' => 'explicație simplificată',
            'flashcards' => 'flashcards pentru recapitulare',
            'quiz' => 'quiz rapid de verificare',
            'study_plan' => 'plan scurt de recapitulare',
        ];

        return "Ești Formely AI, asistent de studiu pentru Formely.\n"
            . "Generează {$toolLabels[$tool]} folosind STRICT conținutul lecției de mai jos. Nu inventa informații externe.\n"
            . "Răspunde STRICT JSON valid cu schema: {$schemas[$tool]}.\n"
            . "Reguli: limba română; concis; orientat pe învățare; dacă faci quiz, exact 5 întrebări cu 4 opțiuni fiecare; dacă faci flashcards, 8-12 carduri.\n\n"
            . "Curs: " . ($lesson->course?->title ?? 'Curs') . "\n"
            . "Modul: " . ($lesson->module?->title ?? 'Fără modul') . "\n"
            . "Lecție: {$lesson->title}\n\n"
            . "CONȚINUT LECȚIE:\n{$lessonText}";
    }

    private function callStudyToolAi(string $prompt): string
    {
        $headers = [
            'Content-Type' => 'application/json',
        ];
        if (!empty($this->apiKey)) {
            $headers['Authorization'] = "Bearer {$this->apiKey}";
        }

        $response = Http::withHeaders($headers)->withOptions([
            'verify' => (bool) config('ai.verify_ssl', true),
        ])->timeout(90)->post("{$this->apiUrl}/chat/completions", [
            'model' => $this->model,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'Ești Formely AI, asistent educațional. Returnezi doar JSON valid.',
                ],
                [
                    'role' => 'user',
                    'content' => $prompt,
                ],
            ],
            'temperature' => 0.25,
            'max_tokens' => 1800,
            'response_format' => ['type' => 'json_object'],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('AI study tool error: ' . $response->body());
        }

        $content = $response->json('choices.0.message.content');
        if (!is_string($content) || trim($content) === '') {
            throw new \RuntimeException('Răspuns AI gol.');
        }

        return $content;
    }

    private function decodeStudyToolJson(string $raw): ?array
    {
        $parsed = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
            return $parsed;
        }

        if (preg_match('/\{[\s\S]*\}/', $raw, $matches)) {
            $parsed = json_decode($matches[0], true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                return $parsed;
            }
        }

        return null;
    }

    private function normalizeStudyToolResult(string $tool, array $data): array
    {
        return match ($tool) {
            'summary' => [
                'title' => (string) ($data['title'] ?? 'Rezumat'),
                'summary' => (string) ($data['summary'] ?? ''),
                'key_points' => array_values(array_slice($data['key_points'] ?? [], 0, 10)),
                'takeaway' => (string) ($data['takeaway'] ?? ''),
            ],
            'explain' => [
                'title' => (string) ($data['title'] ?? 'Explicație simplă'),
                'simple_explanation' => (string) ($data['simple_explanation'] ?? ''),
                'analogy' => (string) ($data['analogy'] ?? ''),
                'steps' => array_values(array_slice($data['steps'] ?? [], 0, 8)),
                'common_confusions' => array_values(array_slice($data['common_confusions'] ?? [], 0, 6)),
            ],
            'flashcards' => [
                'title' => (string) ($data['title'] ?? 'Flashcards'),
                'flashcards' => array_values(array_slice($data['flashcards'] ?? [], 0, 12)),
            ],
            'quiz' => [
                'title' => (string) ($data['title'] ?? 'Quiz rapid'),
                'questions' => array_values(array_slice($data['questions'] ?? [], 0, 5)),
            ],
            'study_plan' => [
                'title' => (string) ($data['title'] ?? 'Plan de recapitulare'),
                'duration_minutes' => (int) ($data['duration_minutes'] ?? 25),
                'steps' => array_values(array_slice($data['steps'] ?? [], 0, 8)),
                'review_focus' => array_values(array_slice($data['review_focus'] ?? [], 0, 8)),
            ],
            default => $data,
        };
    }

    /**
     * Instrucțiuni stricte pentru folosirea datelor reale din `platform_data`.
     */
    private function buildPlatformDataInstructions(): string
    {
        return implode("\n", [
            'REGULI PENTRU DATE (foarte important):',
            '- Ai acces la date reale din baza de date a platformei în câmpul `platform_data` din contextul de mai sus (utilizatori, profiluri elevi, elevi în risc, Ask Your Data, cursuri, înscrieri, teste, examene, evenimente, timp de învățare, activitate recentă).',
            '- Pentru întrebări de business/analitice de tip „ce merge prost?”, „ce cursuri au engagement slab?”, „ce teste trebuie revizuite?”, folosește `platform_data.ask_your_data`.',
            '- Pentru întrebări despre elevi în risc, folosește `platform_data.risk_analysis` și `platform_data.focused_data.students_needing_attention`: include nivelul de risc, scorul, motivele și acțiunile recomandate.',
            '- Pentru întrebări despre un elev/curs/test anume, caută întâi în `platform_data.focused_data.matching_students`, `matching_courses` și `matching_tests`, apoi în `student_profiles` și în restul snapshot-ului.',
            '- Răspunde DIRECT folosind aceste cifre. NU întreba administratorul de date pe care le poți deduce din `platform_data`, `focused_data`, `student_profiles` sau din context.',
            '- Când dai cifre, fii concret (ex: „Ai 124 elevi, dintre care 89 activi în ultimele 30 de zile”).',
            '- Dacă identifici un elev, poți folosi numele, emailul, cursurile înscrise, progresul, testele recente, scorurile și ultima activitate disponibile în context.',
            '- Dacă o valoare lipsește (null) sau secțiunea nu există, spune pe scurt că acea informație nu este disponibilă în date — fără a inventa.',
            '- Pentru rapoarte detaliate sau export, sugerează butonul „Excel” din chat.',
            '- Răspunde în limba română, clar și concis.',
        ]);
    }

    /**
     * Build database-backed context for the admin tutor.
     */
    private function buildTutorContext(Request $request, string $prompt): array
    {
        $user = $request->user();
        $canSeeDrafts = $user && in_array($user->role ?? '', ['admin', 'instructor'], true);
        $catalog = $this->getTutorCourseCatalog($canSeeDrafts);
        $isCatalogQuestion = $this->isCatalogQuestion($prompt);
        $matchedCourse = null;
        $matchedLesson = null;
        $lessonIndex = [];

        $courseId = $request->input('courseId') ?: $request->input('course_id');
        $lessonId = $request->input('lessonId') ?: $request->input('lesson_id');

        if ($courseId) {
            $matchedCourse = collect($catalog['courses'])->firstWhere('id', (int) $courseId);
        }

        if (!$matchedCourse) {
            $matchedCourse = $this->findCourseFromPrompt($prompt, $catalog['courses']);
        }

        if ($lessonId) {
            $matchedLesson = $this->getTutorLessonSummaryById((int) $lessonId, $canSeeDrafts);
        }

        $knowledgeChunks = [];
        if (!$isCatalogQuestion) {
            try {
                $knowledgeChunks = $this->knowledgeService->getRankedChunksForTutor(
                    $prompt,
                    $matchedCourse['id'] ?? null,
                    $matchedLesson['lesson_id'] ?? ($matchedLesson['id'] ?? null),
                    $canSeeDrafts,
                    5
                );
            } catch (\Throwable $e) {
                Log::warning('Tutor knowledge lookup failed, falling back to legacy context', [
                    'error' => $e->getMessage(),
                ]);
                $knowledgeChunks = [];
            }
        }

        if (empty($knowledgeChunks) && (!$matchedCourse || !$matchedLesson)) {
            $lessonIndex = $this->getTutorLessonIndex($canSeeDrafts);

            if (!$matchedCourse || !$matchedLesson) {
                $contentMatch = $this->findCourseAndLessonFromContent($prompt, $lessonIndex);

                if (!$matchedCourse && !empty($contentMatch['course_id'])) {
                    $matchedCourse = collect($catalog['courses'])->firstWhere('id', (int) $contentMatch['course_id']);
                }

                if (!$matchedLesson && !empty($contentMatch['lesson_id'])) {
                    $matchedLesson = $this->findLessonIndexById($lessonIndex, (int) $contentMatch['lesson_id']);
                }
            }
            if (!$matchedLesson && $matchedCourse) {
                $matchedLesson = $this->findLessonFromCourseContent($matchedCourse, $prompt, $lessonIndex);
            }
        }

        $relevantCourses = $this->getRelevantTutorCourses(
            $prompt,
            $catalog['courses'],
            $isCatalogQuestion ? 12 : 5
        );

        $contextChunks = $isCatalogQuestion
            ? $this->buildTutorContextChunks($catalog['courses'], $lessonIndex, $matchedCourse, $matchedLesson, $isCatalogQuestion, $prompt)
            : (!empty($knowledgeChunks)
                ? $knowledgeChunks
                : $this->buildTutorContextChunks($catalog['courses'], $lessonIndex, $matchedCourse, $matchedLesson, $isCatalogQuestion, $prompt));

        // Keep tutor context compact so model answers faster and stays focused.
        $contextChunks = array_values(array_map(function (array $chunk) {
            if (isset($chunk['text'])) {
                $chunk['text'] = mb_substr((string) $chunk['text'], 0, 480);
            }
            return $chunk;
        }, array_slice($contextChunks, 0, 5)));

        $context = [
            'catalog_summary' => $catalog['summary'],
            'query_type' => $isCatalogQuestion ? 'catalog' : 'specific',
            'relevant_courses' => $relevantCourses,
            'matched_course' => $matchedCourse,
            'matched_lesson' => $matchedLesson,
            'context_chunks' => $contextChunks,
            'platform_data' => $this->dataInsightService->buildContextForPrompt($prompt),
        ];

        if ($isCatalogQuestion) {
            $context['catalog_titles'] = collect($catalog['courses'])
                ->map(function (array $course) {
                    return [
                        'id' => $course['id'],
                        'title' => $course['title'],
                        'level' => $course['level'] ?? null,
                        'status' => $course['status'] ?? null,
                    ];
                })
                ->values()
                ->all();
        }

        return $context;
    }

    private function getTutorCourseCatalog(bool $canSeeDrafts): array
    {
        $cacheKey = 'tutor_course_catalog:' . ($canSeeDrafts ? 'all' : 'published');

        return Cache::remember($cacheKey, 600, function () use ($canSeeDrafts) {
            $query = Course::query()
                ->select('id', 'title', 'description', 'level', 'status')
                ->withCount(['modules', 'lessons'])
                ->orderBy('title');

            if (!$canSeeDrafts && SchemaCache::hasColumn('courses', 'status')) {
                $query->where('status', 'published');
            }

            $courses = $query->get();

            return [
                'summary' => [
                    'total_courses' => $courses->count(),
                    'published_courses' => $courses->where('status', 'published')->count(),
                ],
                'courses' => $courses->map(function ($course) {
                    return $this->formatTutorCatalogCourse($course);
                })->values()->all(),
            ];
        });
    }

    private function formatTutorCatalogCourse(Course $course): array
    {
        return [
            'id' => $course->id,
            'title' => $course->title,
            'level' => $course->level,
            'status' => $course->status,
            'description' => mb_substr((string) ($course->description ?? ''), 0, 220),
            'module_count' => (int) ($course->modules_count ?? 0),
            'lesson_count' => (int) ($course->lessons_count ?? 0),
            'module_titles' => [],
            'lesson_titles' => [],
            'standalone_lesson_titles' => [],
        ];
    }

    private function getTutorLessonIndex(bool $canSeeDrafts): array
    {
        $cacheKey = 'tutor_lesson_index:' . ($canSeeDrafts ? 'all' : 'published');

        return Cache::remember($cacheKey, 600, function () use ($canSeeDrafts) {
            $query = Lesson::query()
                ->select('id', 'course_id', 'module_id', 'title', 'content', 'order')
                ->with([
                    'course' => function ($q) {
                        $q->select('id', 'title', 'description', 'level', 'status');
                    },
                    'module' => function ($q) {
                        $q->select('id', 'course_id', 'title', 'order');
                    },
                    'contentBlocks' => function ($q) {
                        $q->select('id', 'lesson_id', 'type', 'source', 'payload', 'order', 'visible')
                            ->orderBy('order');
                    },
                ]);

            if (!$canSeeDrafts && SchemaCache::hasColumn('courses', 'status')) {
                $query->whereHas('course', function ($q) {
                    $q->where('status', 'published');
                });
            }

            $lessons = $query->get();

            return $lessons->map(function (Lesson $lesson) {
                return [
                    'lesson_id' => $lesson->id,
                    'course_id' => $lesson->course_id,
                    'module_id' => $lesson->module_id,
                    'course_title' => (string) ($lesson->course->title ?? ''),
                    'course_description' => mb_substr((string) ($lesson->course->description ?? ''), 0, 220),
                    'course_level' => $lesson->course->level ?? null,
                    'course_status' => $lesson->course->status ?? null,
                    'module_title' => (string) ($lesson->module->title ?? ''),
                    'lesson_title' => (string) ($lesson->title ?? ''),
                    'lesson_order' => $lesson->order,
                    'lesson_updated_at' => $lesson->updated_at?->toIso8601String(),
                    'lesson_content' => mb_substr((string) ($lesson->content ?? ''), 0, 1400),
                    'lesson_blocks' => $this->extractTutorLessonBlockText($lesson->contentBlocks ?? collect()),
                ];
            })->values()->all();
        });
    }

    private function getTutorLessonSummaryById(int $lessonId, bool $canSeeDrafts): ?array
    {
        $query = Lesson::query()
            ->select('id', 'course_id', 'module_id', 'title', 'content', 'order')
            ->with([
                'course' => function ($q) {
                    $q->select('id', 'title', 'description', 'level', 'status');
                },
                'module' => function ($q) {
                    $q->select('id', 'course_id', 'title', 'order');
                },
                'contentBlocks' => function ($q) {
                    $q->select('id', 'lesson_id', 'type', 'source', 'payload', 'order', 'visible')
                        ->orderBy('order');
                },
            ]);

        if (!$canSeeDrafts && SchemaCache::hasColumn('courses', 'status')) {
            $query->whereHas('course', function ($courseQuery) {
                $courseQuery->where('status', 'published');
            });
        }

        $lesson = $query->find($lessonId);
        if (!$lesson) {
            return null;
        }

        return [
            'lesson_id' => $lesson->id,
            'course_id' => $lesson->course_id,
            'module_id' => $lesson->module_id,
            'course_title' => (string) ($lesson->course->title ?? ''),
            'course_description' => mb_substr((string) ($lesson->course->description ?? ''), 0, 220),
            'course_level' => $lesson->course->level ?? null,
            'course_status' => $lesson->course->status ?? null,
            'module_title' => (string) ($lesson->module->title ?? ''),
            'lesson_title' => (string) ($lesson->title ?? ''),
            'lesson_order' => $lesson->order,
            'lesson_updated_at' => $lesson->updated_at?->toIso8601String(),
            'lesson_content' => mb_substr((string) ($lesson->content ?? ''), 0, 1400),
            'lesson_blocks' => $this->extractTutorLessonBlockText($lesson->contentBlocks ?? collect()),
        ];
    }

    private function buildTutorContextChunks(array $catalogCourses, array $lessonIndex, ?array $matchedCourse, ?array $matchedLesson, bool $isCatalogQuestion, string $prompt): array
    {
        $courseFilter = $matchedCourse ? (int) ($matchedCourse['id'] ?? 0) : null;
        $lessonFilter = $matchedLesson ? (int) ($matchedLesson['id'] ?? 0) : null;
        $candidateChunks = [];

        if ($isCatalogQuestion) {
            foreach ($catalogCourses as $course) {
                $text = trim(implode(' ', array_filter([
                    (string) ($course['title'] ?? ''),
                    (string) ($course['description'] ?? ''),
                    'Level: ' . (string) ($course['level'] ?? ''),
                    'Lessons: ' . (string) ($course['lesson_count'] ?? 0),
                    'Modules: ' . (string) ($course['module_count'] ?? 0),
                ])));

                if ($text === '') {
                    continue;
                }

                $candidateChunks[] = [
                    'id' => 'catalog:' . ($course['id'] ?? 0),
                    'text' => $text,
                    'lesson_id' => null,
                    'course_id' => (int) ($course['id'] ?? 0),
                    'module_id' => null,
                    'score' => 0.9,
                    'source' => 'catalog',
                ];
            }

            return array_slice($this->deduplicateTutorChunks($candidateChunks), 0, 8);
        }

        $lessonsPool = $this->shortlistTutorLessonsForPrompt(
            $lessonIndex,
            $prompt,
            $courseFilter,
            $courseFilter ? 90 : 40
        );

        foreach ($lessonsPool as $lesson) {
            if ($courseFilter && (int) ($lesson['course_id'] ?? 0) !== $courseFilter) {
                continue;
            }

            $lessonChunks = $this->splitTutorTextIntoChunks(
                $this->buildTutorLessonChunkText($lesson),
                700,
                80
            );

            foreach ($lessonChunks as $index => $chunkText) {
                $chunkText = trim($chunkText);
                if (mb_strlen($chunkText) < 100) {
                    continue;
                }

                $similarity = $this->scoreTutorChunkSimilarity($prompt, $chunkText);
                $recency = $this->scoreTutorChunkRecency((string) ($lesson['lesson_updated_at'] ?? null));
                $lessonMatch = 0.0;

                if ($lessonFilter && (int) ($lesson['lesson_id'] ?? 0) === $lessonFilter) {
                    $lessonMatch = 1.0;
                } elseif ($courseFilter && (int) ($lesson['course_id'] ?? 0) === $courseFilter) {
                    $lessonMatch = 0.7;
                }

                $finalScore = round(($similarity * 0.7) + ($recency * 0.1) + ($lessonMatch * 0.2), 4);
                if ($finalScore < 0.15) {
                    continue;
                }

                $candidateChunks[] = [
                    'id' => (int) ($lesson['lesson_id'] ?? 0) . ':' . $index,
                    'text' => $chunkText,
                    'lesson_id' => (int) ($lesson['lesson_id'] ?? 0),
                    'course_id' => (int) ($lesson['course_id'] ?? 0),
                    'module_id' => (int) ($lesson['module_id'] ?? 0),
                    'score' => $finalScore,
                    'source' => 'lesson_chunk',
                ];
            }
        }

        $candidateChunks = $this->deduplicateTutorChunks($candidateChunks);

        usort($candidateChunks, function (array $left, array $right) {
            return $right['score'] <=> $left['score'];
        });

        return array_slice($candidateChunks, 0, 5);
    }

    private function shortlistTutorLessonsForPrompt(array $lessonIndex, string $prompt, ?int $courseFilter, int $limit = 40): array
    {
        if (empty($lessonIndex)) {
            return [];
        }

        if ($courseFilter) {
            return array_slice(array_values(array_filter($lessonIndex, function (array $lesson) use ($courseFilter) {
                return (int) ($lesson['course_id'] ?? 0) === (int) $courseFilter;
            })), 0, max(10, $limit));
        }

        $normalizedPrompt = $this->normalizeTutorText($prompt);
        if ($normalizedPrompt === '') {
            return array_slice($lessonIndex, 0, max(10, $limit));
        }

        $scored = [];
        foreach ($lessonIndex as $lesson) {
            $title = $this->normalizeTutorText((string) ($lesson['lesson_title'] ?? ''));
            $module = $this->normalizeTutorText((string) ($lesson['module_title'] ?? ''));
            $course = $this->normalizeTutorText((string) ($lesson['course_title'] ?? ''));
            $score = 0;

            if ($title !== '' && str_contains($normalizedPrompt, $title)) {
                $score += 9;
            }
            if ($module !== '' && str_contains($normalizedPrompt, $module)) {
                $score += 5;
            }
            if ($course !== '' && str_contains($normalizedPrompt, $course)) {
                $score += 6;
            }

            $scored[] = [
                'score' => $score,
                'lesson' => $lesson,
            ];
        }

        usort($scored, fn (array $a, array $b) => $b['score'] <=> $a['score']);
        $shortlisted = array_slice($scored, 0, max(10, $limit));

        return array_values(array_map(fn (array $entry) => $entry['lesson'], $shortlisted));
    }

    private function buildTutorLessonChunkText(array $lesson): string
    {
        $parts = array_filter([
            'Course: ' . (string) ($lesson['course_title'] ?? ''),
            'Module: ' . (string) ($lesson['module_title'] ?? ''),
            'Lesson: ' . (string) ($lesson['lesson_title'] ?? ''),
            (string) ($lesson['course_description'] ?? ''),
            (string) ($lesson['lesson_content'] ?? ''),
            (string) ($lesson['lesson_blocks'] ?? ''),
        ]);

        return trim(implode("\n", $parts));
    }

    private function splitTutorTextIntoChunks(string $text, int $chunkSize = 700, int $overlap = 80): array
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

    private function scoreTutorChunkSimilarity(string $prompt, string $chunkText): float
    {
        $promptTokens = $this->extractTutorSearchTokens($prompt);
        $chunkTokens = $this->extractTutorSearchTokens($chunkText);

        if (empty($promptTokens) || empty($chunkTokens)) {
            return 0.0;
        }

        $promptSet = array_flip($promptTokens);
        $matches = 0;
        foreach ($chunkTokens as $token) {
            if (isset($promptSet[$token])) {
                $matches++;
            }
        }

        $denominator = max(1, min(count($promptTokens), count($chunkTokens)));
        return min(1.0, $matches / $denominator);
    }

    private function scoreTutorChunkRecency(?string $updatedAt): float
    {
        if (!$updatedAt) {
            return 0.5;
        }

        try {
            $timestamp = strtotime($updatedAt);
            if ($timestamp === false) {
                return 0.5;
            }

            $days = max(0, (time() - $timestamp) / 86400);
            return max(0.0, 1.0 - min(1.0, $days / 365));
        } catch (\Throwable $e) {
            return 0.5;
        }
    }

    private function deduplicateTutorChunks(array $chunks): array
    {
        $seen = [];
        $deduped = [];

        foreach ($chunks as $chunk) {
            $hash = md5($chunk['text'] ?? '');
            if (isset($seen[$hash])) {
                continue;
            }

            $seen[$hash] = true;
            $deduped[] = $chunk;
        }

        return $deduped;
    }

    private function findCourseFromPrompt(string $prompt, $availableCourses): ?array
    {
        $normalizedPrompt = $this->normalizeTutorText($prompt);
        $bestCourseId = null;
        $bestScore = 0;

        foreach ($availableCourses as $course) {
            $title = $this->normalizeTutorText((string) ($course['title'] ?? ''));
            if ($title === '') {
                continue;
            }

            if (str_contains($normalizedPrompt, $title)) {
                return $course;
            }

            $score = $this->scoreTutorCourseMatch($normalizedPrompt, $course);

            if ($score > $bestScore && $score >= 3) {
                $bestScore = $score;
                $bestCourseId = (int) $course['id'];
            }
        }

        if (!$bestCourseId) {
            return null;
        }

        return collect($availableCourses)->firstWhere('id', $bestCourseId);
    }

    private function findLessonIndexById(array $lessonIndex, int $lessonId): ?array
    {
        foreach ($lessonIndex as $lesson) {
            if ((int) ($lesson['lesson_id'] ?? 0) === $lessonId) {
                return $lesson;
            }
        }

        return null;
    }

    private function normalizeTutorText(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = Str::ascii($value);
        $value = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $value) ?? $value;
        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }

    private function scoreTutorCourseMatch(string $prompt, array $course): int
    {
        $score = 0;
        $fields = [
            'title' => 6,
            'description' => 3,
            'module_titles' => 2,
            'lesson_titles' => 2,
            'standalone_lesson_titles' => 2,
        ];

        foreach ($fields as $field => $weight) {
            $value = $course[$field] ?? '';
            $values = is_array($value) ? $value : [$value];
            foreach ($values as $entry) {
                $normalized = $this->normalizeTutorText((string) $entry);
                if ($normalized === '') {
                    continue;
                }

                if (str_contains($prompt, $normalized)) {
                    $score += $weight * 2;
                    continue;
                }

                $tokens = array_values(array_filter(preg_split('/\s+/u', $normalized) ?: []));
                $matches = 0;
                foreach ($tokens as $token) {
                    if (mb_strlen($token) < 3) {
                        continue;
                    }
                    if (str_contains($prompt, $token)) {
                        $matches++;
                    }
                }

                if ($matches > 0) {
                    $score += min($weight * 2, $matches * $weight);
                }
            }
        }

        $title = $this->normalizeTutorText((string) ($course['title'] ?? ''));
        $description = $this->normalizeTutorText((string) ($course['description'] ?? ''));
        if ($title !== '' && str_contains($prompt, $title)) {
            $score += 8;
        }
        if ($description !== '') {
            foreach (array_slice(array_filter(preg_split('/\s+/u', $description) ?: []), 0, 12) as $token) {
                if (mb_strlen($token) >= 4 && str_contains($prompt, $token)) {
                    $score += 1;
                }
            }
        }

        return $score;
    }

    private function getRelevantTutorCourses(string $prompt, array $courses, int $limit = 5): array
    {
        $scoredCourses = [];
        foreach ($courses as $course) {
            $score = $this->scoreTutorCourseMatch($prompt, $course);
            if ($score <= 0) {
                continue;
            }

            $scoredCourses[] = [
                'score' => $score,
                'course' => $course,
            ];
        }

        usort($scoredCourses, function (array $left, array $right) {
            return $right['score'] <=> $left['score'];
        });

        return array_values(array_map(
            fn (array $entry) => $entry['course'],
            array_slice($scoredCourses, 0, max(1, $limit))
        ));
    }

    private function findCourseAndLessonFromContent(string $prompt, array $lessonIndex): array
    {
        $tokens = $this->extractTutorSearchTokens($prompt);
        if (empty($tokens)) {
            return ['course_id' => null, 'lesson_id' => null];
        }

        $bestLesson = null;
        $bestScore = 0;

        foreach ($lessonIndex as $lesson) {
            $score = $this->scoreTutorLessonMatch($prompt, [
                'title' => (string) ($lesson['lesson_title'] ?? ''),
                'content' => (string) ($lesson['lesson_content'] ?? ''),
                'blocks' => (string) ($lesson['lesson_blocks'] ?? ''),
                'module_title' => (string) ($lesson['module_title'] ?? ''),
                'course_title' => (string) ($lesson['course_title'] ?? ''),
            ]);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestLesson = $lesson;
            }
        }

        if (!$bestLesson) {
            return ['course_id' => null, 'lesson_id' => null];
        }

        return [
            'course_id' => (int) ($bestLesson['course_id'] ?? 0),
            'lesson_id' => (int) ($bestLesson['lesson_id'] ?? 0),
        ];
    }

    private function findLessonFromCourseContent(array $course, string $prompt, array $lessonIndex): ?array
    {
        $normalizedPrompt = $this->normalizeTutorText($prompt);
        $bestLesson = null;
        $bestScore = 0;

        foreach ($lessonIndex as $lesson) {
            if ((int) ($lesson['course_id'] ?? 0) !== (int) ($course['id'] ?? 0)) {
                continue;
            }

            $score = $this->scoreTutorLessonMatch($normalizedPrompt, [
                'title' => (string) ($lesson['lesson_title'] ?? ''),
                'content' => (string) ($lesson['lesson_content'] ?? ''),
                'blocks' => (string) ($lesson['lesson_blocks'] ?? ''),
                'module_title' => (string) ($lesson['module_title'] ?? ''),
                'course_title' => (string) ($lesson['course_title'] ?? ''),
            ]);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestLesson = $lesson;
            }
        }

        return $bestLesson;
    }

    private function isCatalogQuestion(string $prompt): bool
    {
        $prompt = $this->normalizeTutorText($prompt);

        $keywords = [
            'ce cursuri',
            'care cursuri',
            'cursuri disponibile',
            'lista cursuri',
            'catalog cursuri',
            'ce exista',
            'ce ai',
            'ce pot studia',
            'ce se poate studia',
            'what courses',
            'available courses',
            'course catalog',
        ];

        foreach ($keywords as $keyword) {
            if (str_contains($prompt, $this->normalizeTutorText($keyword))) {
                return true;
            }
        }

        return false;
    }

    private function scoreTutorLessonMatch(string $prompt, array $lesson): int
    {
        $score = 0;
        $fields = [
            'title' => 6,
            'module_title' => 3,
            'course_title' => 3,
            'content' => 5,
            'blocks' => 4,
        ];

        foreach ($fields as $field => $weight) {
            $value = $lesson[$field] ?? '';
            $normalized = $this->normalizeTutorText(strip_tags((string) $value));
            if ($normalized === '') {
                continue;
            }

            if (str_contains($prompt, $normalized)) {
                $score += $weight * 2;
                continue;
            }

            $tokens = array_values(array_filter(preg_split('/\s+/u', $normalized) ?: []));
            $matches = 0;
            foreach ($tokens as $token) {
                if (mb_strlen($token) < 4) {
                    continue;
                }
                if (str_contains($prompt, $token)) {
                    $matches++;
                }
            }

            if ($matches > 0) {
                $score += min($weight * 2, $matches * $weight);
            }
        }

        return $score;
    }

    private function extractTutorSearchTokens(string $prompt): array
    {
        $normalized = $this->normalizeTutorText($prompt);
        $parts = array_values(array_filter(preg_split('/\s+/u', $normalized) ?: []));
        $stopWords = [
            'si', 'sau', 'dar', 'despre', 'care', 'este', 'sunt', 'cum', 'unde', 'cand',
            'what', 'which', 'the', 'and', 'for', 'with', 'course', 'curs', 'cursuri',
            'lecția', 'lectia', 'lecții', 'lectii', 'platforma', 'platformei'
        ];

        $tokens = [];
        foreach ($parts as $part) {
            if (mb_strlen($part) < 4) {
                continue;
            }

            if (in_array($part, $stopWords, true)) {
                continue;
            }

            $tokens[] = $part;
        }

        return array_values(array_unique(array_slice($tokens, 0, 8)));
    }

    private function extractTutorLessonBlockText($blocks): string
    {
        if (empty($blocks)) {
            return '';
        }

        $parts = [];
        foreach ($blocks as $block) {
            if (!$block instanceof ContentBlock) {
                continue;
            }

            if (!$block->visible && $block->visible !== null) {
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

        $text = trim(implode(' ', array_filter($parts)));
        return mb_substr($text, 0, 1800);
    }

    private function streamResponse(Request $request, $type)
    {
        if (!$this->apiKey) {
            // 503: serviciul AI nu e disponibil (configurare), nu o eroare a serverului
            return response()->json(['error' => 'Formely AI nu este configurat: lipsește cheia AI.'], 503);
        }

        $prompt = $request->input('prompt');
        $messages = $request->input('messages', []);
        $courseId = $request->input('courseId');
        $teacherId = $request->input('teacher_id') ?? Auth::id();

        if (!$prompt) {
            return response()->json([
                'error' => 'Prompt is required'
            ], 400);
        }

        // Verifică dacă utilizatorul vrea să clarifice ceva sau să modifice
        $isClarification = $this->isClarificationRequest($prompt, $messages);
        
        Log::info('Formely AI generation request', [
            'type' => $type,
            'prompt' => substr($prompt, 0, 100),
            'has_messages' => count($messages) > 0,
            'is_clarification' => $isClarification,
            'teacher_id' => $teacherId
        ]);

        // Verifică dacă este o cerere de clarificare
        $isClarification = $this->isClarificationRequest($prompt, $messages);
        $teacherId = $request->input('teacher_id') ?? Auth::id();

        $mode = (string) $request->input('mode', $type === 'tutor' ? 'admin_tutor' : '');
        $guidedBrief = null;
        if ($type === 'course' && str_contains((string) $mode, 'guided_creation')) {
            $guidedBrief = $this->normalizeGuidedBrief($request->input('guided_brief'));
        }
        $tutorContext = null;
        $isTutorFlow = $type === 'tutor' || str_starts_with($mode, 'admin_tutor') || str_starts_with($mode, 'student_tutor');
        if ($isTutorFlow) {
            $tutorContext = $this->buildTutorContext($request, $prompt);
            if ($type === 'tutor' || str_starts_with($mode, 'admin_tutor') || str_starts_with($mode, 'student_tutor')) {
                if (
                    $this->shouldUseUltraShortTutorMode($prompt, $tutorContext)
                    && !$this->isAnalyticsQuestion($prompt)
                    && !str_contains($mode, ':ultra_short')
                ) {
                    $mode .= ':ultra_short';
                }

                $intent = $this->determineTutorIntent($prompt);
                if ($intent !== 'answer' && !str_contains($mode, ':' . $intent)) {
                    $mode .= ':' . $intent;
                }
            }
        }

        // Construiește prompt-ul pentru generare (fără parametrul isClarification - modelul decide singur)
        $systemPrompt = $this->getSystemPrompt($type, $courseId, $isClarification, $mode);
        if ($tutorContext) {
            $systemPrompt .= "\n\nContext din baza de date (folosește-l ca sursă principală și nu spune că nu ai acces la date dacă există context):\n"
                . json_encode($tutorContext, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                . "\n\n" . $this->buildPlatformDataInstructions();
        }
        if ($guidedBrief) {
            $systemPrompt .= $this->buildGuidedBriefPrompt($guidedBrief);
        }

        $builderDiffMode = str_contains((string) $mode, 'builder_diff');
        if ($builderDiffMode && $courseId) {
            $builderContext = $this->buildBuilderDiffContext(
                (int) $courseId,
                $request->input('selected_module_id') ?? $request->input('selectedModuleId'),
                $request->input('selected_lesson_id') ?? $request->input('selectedLessonId'),
                $request->input('selected_lesson_draft') ?? $request->input('selectedLessonDraft')
            );
            if ($builderContext !== '') {
                $systemPrompt .= "\n\n" . $builderContext;
            }
        }

        $attachments = $request->input('attachments', []);
        if (is_array($attachments) && !empty($attachments)) {
            $systemPrompt .= "\n\nDocumente atașate de administrator (folosește-le ca sursă adițională pentru răspuns):\n"
                . $this->formatAttachmentContext($attachments);
        }
        
        // Formatează mesajele pentru Hugging Face
        $formattedMessages = $this->formatMessages($systemPrompt, $messages, $prompt);

		$isGuidedCourseCreation = $type === 'course' && str_contains((string) $mode, 'guided_creation') && ($this->provider === 'openai' || $this->provider === 'groq');
        if ($isGuidedCourseCreation) {
            // Pe tier-ul gratuit (ex. Groq) generarea poate atinge limita de tokeni/minut.
            // Reîncercăm automat cu backoff în loc să cerem utilizatorului să apese din nou.
            @set_time_limit(0);
            $maxRateLimitRetries = max(0, (int) config('ai.guided_rate_limit.retries', 2));
            $maxBackoffSeconds = max(5, (int) config('ai.guided_rate_limit.max_backoff', 15));
            $rateLimitAttempt = 0;

            while (true) {
                try {
                    $guidedResult = $this->generateGuidedCourseCreationJson($formattedMessages, $teacherId, $courseId, $mode);
                    return response()->json($guidedResult);
                } catch (\Throwable $e) {
                    if ($this->isRateLimitError(0, (string) $e->getMessage())) {
                        $retryAfterSeconds = $this->extractRetryAfterSeconds((string) $e->getMessage(), 20);

                        if ($rateLimitAttempt < $maxRateLimitRetries) {
                            $rateLimitAttempt++;
                            $waitSeconds = min($maxBackoffSeconds, max(5, $retryAfterSeconds));

                            Log::warning('Guided course creation rate limited; auto-retrying', [
                                'attempt' => $rateLimitAttempt,
                                'max_retries' => $maxRateLimitRetries,
                                'wait_seconds' => $waitSeconds,
                                'course_id' => $courseId,
                                'teacher_id' => $teacherId,
                            ]);

                            sleep($waitSeconds);
                            continue;
                        }

                        Log::warning('Guided course creation rate limited; retries exhausted', [
                            'message' => $e->getMessage(),
                            'retry_after_seconds' => $retryAfterSeconds,
                            'course_id' => $courseId,
                            'teacher_id' => $teacherId,
                        ]);

                        return response()->json([
                            'response_type' => 'clarification',
                            'clarification_question' => "Serviciul AI este ocupat acum (rate limit). Reîncearcă peste {$retryAfterSeconds} secunde.",
                            'content' => "Serviciul AI este ocupat acum (rate limit). Reîncearcă peste {$retryAfterSeconds} secunde.",
                            'retry_after_seconds' => $retryAfterSeconds,
                        ]);
                    }

                    Log::error('Guided course creation failed', [
                        'message' => $e->getMessage(),
                        'trace' => $e->getTraceAsString(),
                        'course_id' => $courseId,
                        'teacher_id' => $teacherId,
                    ]);

                    return response()->json([
                        'error' => config('app.debug') ? $e->getMessage() : 'A apărut o eroare. Încearcă din nou.',
                    ], 500);
                }
            }
        }

        // Configurează response pentru streaming
        return response()->stream(function () use ($formattedMessages, $type, $teacherId, $isClarification, $courseId, $mode) {
            try {
                // Dezactivează output buffering pentru streaming
                if (ob_get_level() > 0) {
                    ob_end_clean();
                }
                
                // Setează headers pentru SSE
                header('Content-Type: text/event-stream');
                header('Cache-Control: no-cache');
                header('Connection: keep-alive');
                header('X-Accel-Buffering: no');
                
            $fullResponse = '';
            $builderDiffMode = str_contains((string) $mode, 'builder_diff');
            // Reset model index pentru fiecare request nou (doar pentru Groq)
            if ($this->provider === 'groq') {
                $envModel = config('ai.groq.model');
                if ($envModel) {
                    $this->currentModelIndex = array_search($envModel, $this->groqModelFallbackChain);
                    if ($this->currentModelIndex === false) {
                        $this->currentModelIndex = 0;
                    }
                } else {
                    $this->currentModelIndex = 0;
                }
            }
            
            // Apelează API-ul modelului (OpenAI-compatible sau Hugging Face)
            if ($this->provider === 'openai' || $this->provider === 'groq') {
                // OpenAI și Groq folosesc același format de chat completions
                $this->streamOpenAIResponse($formattedMessages, $type, $teacherId, $courseId, $fullResponse, $mode);

                if ($builderDiffMode && !empty($fullResponse)) {
                    $builderPlan = $this->extractFirstJsonObjectFromText($fullResponse);
                    if (is_array($builderPlan)) {
                        $builderValidation = $this->validateBuilderDiffPlanData($builderPlan);
                        if (!empty($builderValidation['clarification'])) {
                            echo "data: " . json_encode([
                                'response_type' => 'clarification',
                                'clarification_question' => $builderValidation['clarification_question'] ?? 'Am nevoie de o clarificare ca să continui.',
                            ]) . "\n\n";
                            @ob_flush();
                            flush();
                        } elseif (empty($builderValidation['valid'])) {
                            echo "data: " . json_encode([
                                'response_type' => 'clarification',
                                'clarification_question' => $builderValidation['message'] ?? 'Planul Formely AI este incomplet și necesită clarificări.',
                            ]) . "\n\n";
                            @ob_flush();
                            flush();
                        } else {
                            echo "data: " . json_encode([
                                'response_type' => 'course',
                            ]) . "\n\n";
                            @ob_flush();
                            flush();
                        }
                    }
                }
                
                // După streaming, verifică dacă trebuie să creezi cursul
                // În modul builder_diff NU creăm curs nou: planul de operații e aplicat de frontend.
                if ($type === 'course' && !$builderDiffMode && $mode !== 'admin_tutor' && !empty($fullResponse)) {
                    // Verifică dacă este răspuns fallback
                    $isFallback = strpos($fullResponse, 'Curs generat prin Formely AI') !== false ||
                                 strpos($fullResponse, 'Acesta este un curs generat automat') !== false;
                    
                    if ($isFallback) {
                        Log::warning('Fallback response detected - skipping course creation', [
                            'response_preview' => substr($fullResponse, 0, 200)
                        ]);
                        return;
                    }
                    
                    // Verifică dacă răspunsul conține JSON valid (cursul poate fi creat/modificat)
                    $hasValidJson = $this->hasValidCourseJson($fullResponse);
                    
                    Log::info('Checking if response has valid JSON', [
                        'has_valid_json' => $hasValidJson,
                        'response_length' => strlen($fullResponse),
                        'response_preview' => substr($fullResponse, 0, 500),
                        'is_fallback' => $isFallback
                    ]);
                    
                    if ($hasValidJson) {
                        // Volt a generat un curs valid - creează-l sau actualizează-l automat
                        try {
                            $createdCourse = $this->createOrUpdateCourseFromResponse($fullResponse, $teacherId, $courseId);
                            if ($createdCourse) {
                                $isUpdate = $courseId !== null;
                                // Trimite notificare că cursul a fost creat/actualizat (fără redirect)
                                echo "data: " . json_encode([
                                    'content' => "\n\n✅ Cursul a fost " . ($isUpdate ? 'actualizat' : 'creat') . " automat în background!\n\n📚 ID: {$createdCourse->id}\n📝 Titlu: {$createdCourse->title}\n📦 Module: " . $createdCourse->modules()->count() . "\n📄 Lecții: " . $createdCourse->lessons()->count() . "\n\nPoți continua conversația sau să îmi spui dacă vrei să modific ceva."
                                ]) . "\n\n";
                                echo "data: " . json_encode([
                                    'course_id' => $createdCourse->id,
                                    'course_created' => !$isUpdate,
                                    'course_updated' => $isUpdate
                                ]) . "\n\n";
                                @ob_flush();
                                flush();
                            }
                        } catch (\Exception $e) {
                            Log::error('Error creating/updating course from Formely AI response', [
                                'error' => $e->getMessage(),
                                'trace' => $e->getTraceAsString(),
                                'course_id' => $courseId
                            ]);
                            echo "data: " . json_encode([
                                'content' => "\n\n❌ Eroare la " . ($courseId ? 'actualizarea' : 'crearea') . " cursului: " . $e->getMessage() . "\n\nTe rugăm să încerci din nou sau să reformulezi cererea."
                            ]) . "\n\n";
                            @ob_flush();
                            flush();
                        }
                    }
                    // Dacă nu are JSON valid, înseamnă că Volt a întrebat ceva - nu creăm/modificăm cursul
                }
            } elseif ($this->provider === 'huggingface') {
                $this->streamHuggingFaceResponse($formattedMessages, $type, $teacherId, $courseId, $fullResponse);
            } else {
                throw new \Exception("Unsupported provider: {$this->provider}");
            }
            } catch (\Exception $e) {
                // Trimite eroarea către frontend prin SSE
                Log::error('Error in stream response', [
                    'message' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
                
                echo "data: " . json_encode([
                    'error' => $e->getMessage()
                ]) . "\n\n";
                
                @ob_flush();
                flush();
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function buildGuidedCourseCreationPrompt(): string
    {
        return VoltPromptService::buildGuidedCourseCreationPrompt();
    }

    private function buildBuilderDiffPrompt(): string
    {
        return VoltPromptService::buildBuilderDiffPrompt();
    }

    /**
     * Snapshot of the current course builder state so Volt can propose targeted diffs.
     */
    private function buildBuilderDiffContext(int $courseId, $selectedModuleId = null, $selectedLessonId = null, $selectedLessonDraft = null): string
    {
        if ($courseId <= 0) {
            return '';
        }

        try {
            $structure = $this->courseBuilderService->getBuilderStructure($courseId);
        } catch (\Throwable $e) {
            Log::warning('Builder diff context load failed', [
                'course_id' => $courseId,
                'error' => $e->getMessage(),
            ]);

            return '';
        }

        $course = $structure['course'];
        $focusModuleId = is_numeric($selectedModuleId) ? (int) $selectedModuleId : null;
        $focusLessonId = is_numeric($selectedLessonId) ? (int) $selectedLessonId : null;

        $payload = [
            'course_id' => (int) $course->id,
            'title' => (string) ($course->title ?? ''),
            'description' => mb_substr($this->studyToolPlainText((string) ($course->description ?? '')), 0, 500),
            'status' => $course->status ?? null,
            'focus' => [
                'module_id' => $focusModuleId,
                'lesson_id' => $focusLessonId,
            ],
            'modules' => [],
            'root_lessons' => [],
        ];

        foreach ($structure['modules'] as $module) {
            $moduleEntry = [
                'id' => (int) $module->id,
                'title' => (string) ($module->title ?? ''),
                'description' => mb_substr($this->studyToolPlainText((string) ($module->description ?? '')), 0, 300),
                'order' => $module->order ?? null,
                'status' => $module->status ?? null,
                'is_focus' => $focusModuleId !== null && (int) $module->id === $focusModuleId,
                'lessons' => [],
            ];

            foreach ($module->lessons as $lesson) {
                $moduleEntry['lessons'][] = $this->formatBuilderLessonSnapshot($lesson, $focusLessonId);
            }

            $payload['modules'][] = $moduleEntry;
        }

        foreach ($structure['root_lessons'] as $lesson) {
            $payload['root_lessons'][] = $this->formatBuilderLessonSnapshot($lesson, $focusLessonId);
        }

        $draft = is_array($selectedLessonDraft) ? $selectedLessonDraft : null;
        if ($draft && !empty($draft['id']) && is_numeric($draft['id'])) {
            $draftId = (int) $draft['id'];
            $draftContent = $this->studyToolPlainText((string) ($draft['content'] ?? ''));
            if ($draftContent !== '') {
                $payload['focus_draft'] = [
                    'lesson_id' => $draftId,
                    'title' => (string) ($draft['title'] ?? ''),
                    'content_preview' => mb_substr($draftContent, 0, 4000),
                    'note' => 'Conținut din editor (poate fi nesalvat) — folosește-l ca bază pentru update_lesson.',
                ];
            }
        }

        $instructions = [
            'Folosește STRICT această structură ca sursă de adevăr pentru ce există deja în builder.',
            'Pentru update/delete/reorder folosește module_id și lesson_id din context — nu inventa ID-uri.',
            'Nu recrea module sau lecții care există deja dacă utilizatorul cere o modificare locală.',
            'Dacă focus.lesson_id sau focus.module_id este setat, prioritizează acea zonă.',
            'Pentru update_lesson folosește lesson_id existent; pentru create_lesson folosește module_id corect.',
            'Dacă există focus_draft, tratează-l ca versiunea curentă a lecției selectate.',
        ];

        return "STRUCTURA CURSULUI CURENT (builder — ce există deja):\n"
            . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            . "\n\nInstrucțiuni context builder:\n- "
            . implode("\n- ", $instructions);
    }

    private function formatBuilderLessonSnapshot(Lesson $lesson, ?int $focusLessonId): array
    {
        $text = $this->extractStudyToolLessonText($lesson);
        $isFocus = $focusLessonId !== null && (int) $lesson->id === $focusLessonId;
        $previewLimit = $isFocus ? 1400 : 320;

        return [
            'id' => (int) $lesson->id,
            'module_id' => $lesson->module_id ? (int) $lesson->module_id : null,
            'title' => (string) ($lesson->title ?? ''),
            'order' => $lesson->order ?? null,
            'status' => $lesson->status ?? null,
            'is_preview' => (bool) ($lesson->is_preview ?? false),
            'content_preview' => mb_substr($text, 0, $previewLimit),
            'content_chars' => mb_strlen($text),
            'is_focus' => $isFocus,
        ];
    }

    private function getSystemPrompt($type, $courseId = null, $isClarification = false, $mode = '')
    {
        if ($type === 'tutor' || str_starts_with((string) $mode, 'admin_tutor') || str_starts_with((string) $mode, 'student_tutor')) {
            return VoltPromptService::buildAdminTutorPrompt((string) $mode);
        }

        if (str_contains((string) $mode, 'builder_diff')) {
            return VoltPromptService::buildBuilderDiffPrompt();
        }

        if ($type === 'course' && str_contains($mode, 'guided_creation')) {
            $outlineMode = str_contains($mode, ':outline');
            $jsonMode = ($this->provider === 'openai' || $this->provider === 'groq') ? 'Răspunde doar JSON valid când ai toate datele.' : '';

            if ($outlineMode) {
                return VoltPromptService::buildCourseOutlinePrompt($jsonMode);
            }

            return VoltPromptService::buildGuidedCourseCreationPrompt();
        }

        if ($type === 'course') {
            $jsonMode = ($this->provider === 'openai' || $this->provider === 'groq') ? 'IMPORTANT: Răspunde întotdeauna în format JSON valid. ' : '';
            return VoltPromptService::buildCourseDesignPrompt($jsonMode);
        }

        return VoltPromptService::buildTestPrompt(($this->provider === 'openai' || $this->provider === 'groq') ? 'IMPORTANT: Răspunde întotdeauna în format JSON valid. ' : '');
    }
    public function streamOpenAIResponse($messages, $type, $teacherId = null, $courseId = null, &$fullResponse = null, $mode = '')
    {
        if ($fullResponse === null) {
            $fullResponse = '';
        }
        
        try {
            $url = "{$this->apiUrl}/chat/completions";
            
            $providerName = $this->provider === 'groq' ? 'Groq' : 'OpenAI';
            Log::info("{$providerName} API Request", [
                'url' => $url,
                'model' => $this->model,
                'messages_count' => count($messages)
            ]);

            $isGuidedCreation = str_contains((string) $mode, 'guided_creation');
            $isBuilderDiff = str_contains((string) $mode, 'builder_diff');
            $isTutorMode = str_starts_with((string) $mode, 'admin_tutor') || str_starts_with((string) $mode, 'student_tutor') || $type === 'tutor';
            $isAdminTutor = str_starts_with((string) $mode, 'admin_tutor');
            $adminTutorMaxTokens = max(400, (int) config('ai.max_tokens.admin_tutor', 900));
            $useHighQualityCreatorModel = $this->shouldUseHighQualityCreatorModel($messages, (string) $mode);
            $defaultTimeout = max(30, (int) config('ai.timeouts.request', 180));
            $guidedTimeoutRaw = (int) config('ai.timeouts.guided_creation', 0);
            // 0 => no timeout for guided course creation (can run longer on local Ollama).
            $guidedTimeout = $guidedTimeoutRaw <= 0 ? 0 : max($defaultTimeout, $guidedTimeoutRaw);
            $tutorTimeout = max(30, (int) config('ai.timeouts.tutor', 120));
            $connectTimeout = max(5, (int) config('ai.timeouts.connect', 15));
            $effectiveTimeout = $isGuidedCreation ? $guidedTimeout : ($isTutorMode ? $tutorTimeout : $defaultTimeout);
            $guidedMaxTokens = max(500, (int) config('ai.max_tokens.guided', 8192));
            $effectiveModel = $this->model;
            if ($isGuidedCreation || $isBuilderDiff) {
                if ($this->provider === 'groq') {
                    $effectiveModel = (config('ai.groq.creator_model') ?: $effectiveModel);
                    if ($useHighQualityCreatorModel) {
                        $effectiveModel = (config('ai.groq.creator_quality_model') ?: $effectiveModel);
                    }
                } elseif ($this->provider === 'openai') {
                    $effectiveModel = (config('ai.openai.creator_model') ?: $effectiveModel);
                    if ($useHighQualityCreatorModel) {
                        $effectiveModel = (config('ai.openai.creator_quality_model') ?: $effectiveModel);
                    }
                }
            } elseif ($isTutorMode) {
                if ($this->provider === 'groq') {
                    $effectiveModel = (config('ai.groq.creator_model') ?: $effectiveModel);
                } elseif ($this->provider === 'openai') {
                    $effectiveModel = (config('ai.openai.creator_model') ?: $effectiveModel);
                }
            }

            // Prepare request payload
            $payload = [
                'model' => $effectiveModel,
                'messages' => $messages,
                'stream' => true,
                'temperature' => ($isGuidedCreation || $isBuilderDiff)
                    ? 0.2
                    : ($isTutorMode ? (str_contains((string) $mode, ':ultra_short') ? 0.1 : 0.2) : 0.7),
                'max_tokens' => $isGuidedCreation
                    ? $guidedMaxTokens
                    : ($isBuilderDiff
                        ? max(2000, (int) config('ai.max_tokens.builder_diff', 6000))
                        : ($isTutorMode
                            ? (str_contains((string) $mode, ':ultra_short')
                                ? 180
                                : ($isAdminTutor ? $adminTutorMaxTokens : 280))
                            : 4000)),
                'top_p' => $isTutorMode ? 0.8 : 1,
            ];
            
            // Only add response_format for structured generation flows (not tutor chat).
            // Groq supports json_object too — required for builder_diff to return a valid plan.
            if (!$isTutorMode && ($this->provider === 'openai' || ($this->provider === 'groq' && $isBuilderDiff))) {
                $payload['response_format'] = ['type' => 'json_object'];
            }
            
            // Use cURL for proper streaming support
            $ch = curl_init($url);
            $buffer = '';
            $errorResponse = '';
            $headers = '';
            $responseBody = '';
            
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
            $requestHeaders = [
                'Content-Type: application/json',
            ];
            if (!empty($this->apiKey)) {
                $requestHeaders[] = 'Authorization: Bearer ' . $this->apiKey;
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $requestHeaders);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            $verify = (bool) config('ai.verify_ssl', true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $verify);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
            curl_setopt($ch, CURLOPT_TIMEOUT, $effectiveTimeout);
            curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) use (&$headers) {
                $headers .= $header;
                return strlen($header);
            });
            
            // Write function to handle streaming chunks
            curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) use (&$fullResponse, &$buffer, &$errorResponse, &$responseBody) {
                $responseBody .= $data;
                
                // Check if this is an error response (JSON error, not streaming)
                if (strpos($data, '"error"') !== false && strpos($data, 'data:') === false) {
                    $errorResponse .= $data;
                    // Try to parse error
                    try {
                        $errorData = json_decode($data, true);
                        if (isset($errorData['error'])) {
                            $errorMsg = is_array($errorData['error']) ? ($errorData['error']['message'] ?? json_encode($errorData['error'])) : $errorData['error'];
                            $errorResponse = $errorMsg;
                        }
                    } catch (\Exception $e) {
                        // Keep raw error
                    }
                }
                
                // Process streaming data
                $buffer .= $data;
                $lines = explode("\n", $buffer);
                
                // Keep incomplete line in buffer
                $buffer = array_pop($lines);
                
                foreach ($lines as $line) {
                    $line = trim($line);
                    if (empty($line)) {
                        continue;
                    }
                    
                    // Check if it's SSE format
                    if (str_starts_with($line, 'data: ')) {
                        $jsonData = substr($line, 6);
                        if ($jsonData === '[DONE]') {
                            return strlen($data);
                        }
                        
                        try {
                            $chunk = json_decode($jsonData, true);
                            if (isset($chunk['choices'][0]['delta']['content'])) {
                                $content = $chunk['choices'][0]['delta']['content'];
                                $fullResponse .= $content;
                                
                                // Stream chunk to client
                                echo "data: " . json_encode(['content' => $content]) . "\n\n";
                                @ob_flush();
                                flush();
                            }
                        } catch (\Exception $e) {
                            // Skip invalid JSON chunks
                            continue;
                        }
                    }
                }
                
                return strlen($data);
            });
            
            $execResult = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
            
            if ($curlError) {
                Log::error("{$providerName} API CURL Error", ['error' => $curlError]);
                throw new \Exception("{$providerName} API CURL error: {$curlError}");
            }
            
            if ($httpCode !== 200) {
                // Try to get error details from response
                $errorDetails = $errorResponse ?: (substr($responseBody, 0, 500) ?: 'No error details available');
                
                // Check if it's a model not found error (404)
                $isModelNotFound = $this->isModelUnavailableError($httpCode, $errorDetails);
                
                // Check if it's a rate limit/quota error
                $isRateLimit = $this->isRateLimitError($httpCode, $errorDetails);
                
                // Dacă modelul nu există sau e rate limit, încercăm următorul model (doar pentru Groq)
                if (($isModelNotFound || $isRateLimit) && $this->provider === 'groq') {
                    $errorType = $isModelNotFound ? 'Model Not Found' : 'Rate Limit/Quota Exceeded';
                    Log::warning("{$providerName} API {$errorType}", [
                        'status' => $httpCode,
                        'error' => substr($errorDetails, 0, 500),
                        'current_provider' => $this->provider,
                        'current_model' => $this->model
                    ]);
                    
                    $nextModel = $this->getNextGroqModel();
                    
                    if ($nextModel) {
                        Log::info("Switching to fallback Groq model", [
                            'from' => $this->model,
                            'to' => $nextModel,
                            'reason' => $isModelNotFound ? 'model_not_found' : 'rate_limit'
                        ]);
                        
                        // Send message to client about model switch
                        $message = $isModelNotFound 
                            ? "\n\n⏳ Modelul {$this->model} nu este disponibil. Trec la modelul alternativ ({$nextModel})...\n\n"
                            : "\n\n⏳ Limita pentru modelul {$this->model} a fost atinsă. Trec la modelul alternativ ({$nextModel})...\n\n";
                        
                        echo "data: " . json_encode([
                            'content' => $message
                        ]) . "\n\n";
                                @ob_flush();
                                flush();
                        
                        // Switch to next model
                        $this->model = $nextModel;
                        
                        // Retry with new model (preserve $mode so model/JSON settings stay correct)
                        return $this->streamOpenAIResponse($messages, $type, $teacherId, $courseId, $fullResponse, $mode);
                    }
                    
                    // No more models available or not using Groq - wait and retry
                    Log::warning("No more fallback models available, waiting before retry", [
                        'provider' => $this->provider,
                        'model' => $this->model
                    ]);
                    
                    // Send rate limit message to client
                    echo "data: " . json_encode([
                        'content' => "\n\n⏳ Am atins limita de request-uri per minut. Aștept 60 de secunde înainte de a continua...\n\n"
                    ]) . "\n\n";
                @ob_flush();
                flush();
                    
                    // Wait 60 seconds before retrying
                    sleep(60);
                    
                    // Retry the request (preserve $mode so model/JSON settings stay correct)
                    Log::info("Retrying {$providerName} API request after rate limit wait");
                    return $this->streamOpenAIResponse($messages, $type, $teacherId, $courseId, $fullResponse, $mode);
                }
                
                Log::error("{$providerName} API Error", [
                    'status' => $httpCode,
                    'error_response' => substr($errorDetails, 0, 500),
                    'full_response' => substr($responseBody, 0, 1000),
                    'headers' => substr($headers, 0, 500),
                    'payload' => json_encode($payload)
                ]);
                throw new \Exception("{$providerName} API error: HTTP {$httpCode}. " . substr($errorDetails, 0, 200));
            }
            
            Log::info("{$providerName} API Success", [
                'response_length' => strlen($fullResponse),
                'preview' => substr($fullResponse, 0, 300),
                'has_json' => preg_match('/\{[\s\S]*\}/', $fullResponse) ? 'yes' : 'no'
            ]);
        } catch (\Exception $e) {
            $providerName = $this->provider === 'groq' ? 'Groq' : 'OpenAI';
            Log::error("{$providerName} API Exception", [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    private function streamHuggingFaceResponse($messages, $type, $teacherId = null, $courseId = null, &$fullResponse = null)
    {
        if ($fullResponse === null) {
            $fullResponse = '';
        }
        try {
            // Încearcă să folosească Hugging Face Inference API pentru chat completions
            // Dacă nu funcționează, folosește text generation
            $useChatCompletions = false; // Hugging Face nu are chat completions standard ca OpenAI
            
            if ($useChatCompletions) {
                // Tentativă cu chat completions (dacă modelul suportă)
                $url = "{$this->hfApiUrl}/v1/chat/completions";
                
                $response = Http::withOptions([
                    // Verificare SSL ca la celelalte apeluri AI (AI_VERIFY_SSL)
                    'verify' => (bool) config('ai.verify_ssl', true),
                ])->withHeaders([
                    'Authorization' => "Bearer {$this->hfApiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(120)->stream(function ($chunk) {
                    $data = json_decode($chunk, true);
                    if (isset($data['choices'][0]['delta']['content'])) {
                        $content = $data['choices'][0]['delta']['content'];
                        echo "data: " . json_encode(['content' => $content]) . "\n\n";
                        @ob_flush();
                        flush();
                    }
                }, 'POST', $url, [
                    'model' => $this->model,
                    'messages' => $messages,
                    'stream' => true,
                    'temperature' => 0.7,
                    'max_tokens' => 2000,
                ]);
            } else {
                // Folosește text generation API (metoda standard Hugging Face)
                $prompt = $this->messagesToPrompt($messages);
                
                // Încearcă cu modelul configurat
                $url = "{$this->hfApiUrl}/models/{$this->model}";
                
                Log::info('Hugging Face API Request', [
                    'url' => $url,
                    'model' => $this->model,
                    'prompt_length' => strlen($prompt),
                    'prompt_preview' => substr($prompt, 0, 300) . '...'
                ]);

                $response = Http::withOptions([
                    // Verificare SSL ca la celelalte apeluri AI (AI_VERIFY_SSL)
                    'verify' => (bool) config('ai.verify_ssl', true),
                ])->withHeaders([
                    'Authorization' => "Bearer {$this->hfApiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(180)->post($url, [
                    'inputs' => $prompt,
                    'parameters' => [
                        'max_new_tokens' => 4000, // Mărit pentru cursuri complete
                        'temperature' => 0.7,
                        'return_full_text' => false,
                        'do_sample' => true,
                        'top_p' => 0.9,
                        'top_k' => 50,
                        'repetition_penalty' => 1.1,
                    ],
                    'options' => [
                        'wait_for_model' => true,
                    ],
                ]);

                if ($response->successful()) {
                    $result = $response->json();
                    
                    Log::info('Hugging Face API Success', [
                        'response_keys' => array_keys($result),
                        'has_array' => isset($result[0]),
                        'response_preview' => is_string($result) ? substr($result, 0, 200) : (isset($result[0]) ? json_encode($result[0]) : json_encode($result))
                    ]);
                    
                    $text = null;
                    
                    if (isset($result[0]['generated_text'])) {
                        $text = $result[0]['generated_text'];
                        Log::info('Found generated_text in array', [
                            'length' => strlen($text),
                            'preview' => substr($text, 0, 200)
                        ]);
                    } elseif (isset($result['generated_text'])) {
                        $text = $result['generated_text'];
                        Log::info('Found generated_text in object', [
                            'length' => strlen($text),
                            'preview' => substr($text, 0, 200)
                        ]);
                    } elseif (is_string($result)) {
                        $text = $result;
                        Log::info('Response is string', [
                            'length' => strlen($text),
                            'preview' => substr($text, 0, 200)
                        ]);
                    }
                    
                    if ($text) {
                        // Elimină prompt-ul din răspuns (dacă este inclus)
                        if (strpos($text, $prompt) === 0) {
                            $text = substr($text, strlen($prompt));
                        }
                        
                        // Elimină tag-urile Llama dacă există
                        $text = preg_replace('/<\|[^|]+\|>/', '', $text);
                        $text = trim($text);
                        
                        Log::info('Processed response text', [
                            'final_length' => strlen($text),
                            'preview' => substr($text, 0, 500),
                            'has_json' => preg_match('/\{[\s\S]*\}/', $text) ? 'yes' : 'no'
                        ]);
                        
                        $fullResponse = $text;
                        // Simulează streaming pentru o experiență mai bună
                        $this->streamText($text);
                    } else {
                        // Încearcă cu un model alternativ sau fallback
                        Log::warning('Unexpected Hugging Face response format - using fallback', [
                            'response' => is_array($result) ? json_encode($result) : (is_string($result) ? substr($result, 0, 500) : gettype($result)),
                            'response_type' => gettype($result),
                            'response_keys' => is_array($result) ? array_keys($result) : 'N/A'
                        ]);
                        $fallbackText = $this->getFallbackResponse($type);
                        $fullResponse = $fallbackText;
                        $this->streamText($fallbackText);
                    }
                } else {
                    $statusCode = $response->status();
                    $errorBody = $response->body();
                    
                    Log::error('Hugging Face API Error', [
                        'status' => $statusCode,
                        'error' => $errorBody,
                        'headers' => $response->headers()
                    ]);

                    // Dacă modelul nu e gata, așteaptă și reîncearcă
                    if ($statusCode === 503) {
                        $errorData = $response->json();
                        $estimatedTime = $errorData['estimated_time'] ?? 10;
                        $errorMessage = "Modelul este încărcare. Timp estimat: {$estimatedTime} secunde. Te rugăm să aștepți și să încerci din nou.";
                        $fullResponse = $errorMessage;
                        $this->streamText($errorMessage);
                    } else {
                        // Fallback: răspuns generat local
                        Log::info('Using fallback response');
                        $fallbackText = $this->getFallbackResponse($type);
                        $fullResponse = $fallbackText;
                        $this->streamText($fallbackText);
                    }
                }
            }

            // După ce streaming-ul este terminat, verifică dacă răspunsul conține JSON valid
            // Dacă da, creează sau actualizează cursul automat în background
            if ($type === 'course' && !empty($fullResponse)) {
                // Verifică dacă este fallback response (nu crea curs dacă este fallback)
                $isFallback = strpos($fullResponse, 'Curs generat prin Formely AI') !== false && 
                             strpos($fullResponse, 'Acesta este un curs generat automat') !== false;
                
                if ($isFallback) {
                    Log::warning('Fallback response detected - skipping course creation', [
                        'response_preview' => substr($fullResponse, 0, 200)
                    ]);
                    // Nu crea cursul dacă este fallback
                    return;
                }
                
                // Verifică dacă răspunsul conține JSON valid (cursul poate fi creat/modificat)
                $hasValidJson = $this->hasValidCourseJson($fullResponse);
                
                Log::info('Checking if response has valid JSON', [
                    'has_valid_json' => $hasValidJson,
                    'response_length' => strlen($fullResponse),
                    'response_preview' => substr($fullResponse, 0, 500),
                    'is_fallback' => $isFallback
                ]);
                
                if ($hasValidJson) {
                    // Volt a generat un curs valid - creează-l sau actualizează-l automat
                    try {
                        $createdCourse = $this->createOrUpdateCourseFromResponse($fullResponse, $teacherId, $courseId);
                        if ($createdCourse) {
                            $isUpdate = $courseId !== null;
                            // Trimite notificare că cursul a fost creat/actualizat (fără redirect)
                            echo "data: " . json_encode([
                                'content' => "\n\n✅ Cursul a fost " . ($isUpdate ? 'actualizat' : 'creat') . " automat în background!\n\n📚 ID: {$createdCourse->id}\n📝 Titlu: {$createdCourse->title}\n📦 Module: " . $createdCourse->modules()->count() . "\n📄 Lecții: " . $createdCourse->lessons()->count() . "\n\nPoți continua conversația sau să îmi spui dacă vrei să modific ceva."
                            ]) . "\n\n";
                            echo "data: " . json_encode([
                                'course_id' => $createdCourse->id,
                                'course_created' => !$isUpdate,
                                'course_updated' => $isUpdate
                            ]) . "\n\n";
                            @ob_flush();
                            flush();
                        }
                    } catch (\Exception $e) {
                        Log::error('Error creating/updating course from Formely AI response', [
                            'error' => $e->getMessage(),
                            'trace' => $e->getTraceAsString(),
                            'course_id' => $courseId
                        ]);
                        echo "data: " . json_encode([
                            'content' => "\n\n❌ Eroare la " . ($courseId ? 'actualizarea' : 'crearea') . " cursului: " . $e->getMessage() . "\n\nTe rugăm să încerci din nou sau să reformulezi cererea."
                        ]) . "\n\n";
                        @ob_flush();
                        flush();
                    }
                }
                // Dacă nu are JSON valid, înseamnă că Volt a întrebat ceva - nu creăm/modificăm cursul
            }

            $responseMetadata = $this->extractAIResponseMetadataFromText($fullResponse);
            if (!empty($responseMetadata)) {
                echo "data: " . json_encode($responseMetadata) . "\n\n";
                @ob_flush();
                flush();
            }

            echo "data: [DONE]\n\n";
            @ob_flush();
            flush();
        } catch (\Exception $e) {
            Log::error('Hugging Face API Exception', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            echo "data: " . json_encode([
                'error' => 'Eroare la generarea răspunsului: ' . $e->getMessage()
            ]) . "\n\n";
            @ob_flush();
            flush();
        }
    }

    private function streamText($text)
    {
        if (empty($text)) {
            Log::warning('Empty text to stream');
            return;
        }
        
        // Simulează streaming pentru o experiență mai bună
        $chunks = $this->splitIntoChunks($text, 20); // 20 caractere per chunk
        
        Log::info('Streaming text', ['total_chunks' => count($chunks), 'text_length' => strlen($text)]);
        
        foreach ($chunks as $index => $chunk) {
            $data = json_encode(['content' => $chunk]);
            echo "data: {$data}\n\n";
            
            // Forțează flush
            @ob_flush();
            flush();
            
            // Delay mai mic pentru a fi mai rapid
            if ($index < count($chunks) - 1) {
                usleep(20000); // 20ms delay
            }
        }
    }

    private function splitIntoChunks($text, $chunkSize)
    {
        $chunks = [];
        $length = mb_strlen($text, 'UTF-8');
        
        for ($i = 0; $i < $length; $i += $chunkSize) {
            $chunks[] = mb_substr($text, $i, $chunkSize, 'UTF-8');
        }
        
        return $chunks;
    }

    private function messagesToPrompt($messages)
    {
        // Format pentru Llama 3.1 Instruct
        $prompt = '<|begin_of_text|><|start_header_id|>system<|end_header_id|>' . "\n\n";
        
        // Extrage system prompt
        $systemPrompt = '';
        $otherMessages = [];
        foreach ($messages as $msg) {
            $role = $msg['role'] ?? 'user';
            $content = $msg['content'] ?? '';
            
            if ($role === 'system') {
                $systemPrompt = $content;
            } else {
                $otherMessages[] = $msg;
            }
        }
        
        // Adaugă system prompt
        $prompt .= $systemPrompt . '<|eot_id|>' . "\n";
        
        // Adaugă conversația
        foreach ($otherMessages as $msg) {
            $role = $msg['role'] ?? 'user';
            $content = $msg['content'] ?? '';
            
            if ($role === 'user') {
                $prompt .= '<|start_header_id|>user<|end_header_id|>' . "\n\n";
                $prompt .= $content . '<|eot_id|>' . "\n";
            } elseif ($role === 'assistant') {
                $prompt .= '<|start_header_id|>assistant<|end_header_id|>' . "\n\n";
                $prompt .= $content . '<|eot_id|>' . "\n";
            }
        }
        
        // Adaugă tag-ul pentru răspunsul assistant-ului
        $prompt .= '<|start_header_id|>assistant<|end_header_id|>' . "\n\n";
        
        Log::info('Formatted prompt for Llama', [
            'prompt_length' => strlen($prompt),
            'messages_count' => count($messages),
            'system_prompt_length' => strlen($systemPrompt)
        ]);
        
        return $prompt;
    }

    private function getFallbackResponse($type)
    {
        if ($type === 'course') {
            return json_encode([
                'title' => 'Curs generat prin Formely AI',
                'description' => 'Acesta este un curs generat automat. Te rugăm să completezi detaliile manual.',
                'short_description' => 'Curs generat prin Formely AI',
                'modules' => [
                    [
                        'title' => 'Modulul 1',
                        'description' => 'Descriere modul',
                        'lessons' => [
                            [
                                'title' => 'Lecția 1',
                                'content' => 'Conținutul lecției va fi adăugat aici.'
                            ]
                        ]
                    ]
                ]
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        } else {
            return json_encode([
                'title' => 'Test generat prin Formely AI',
                'description' => 'Acesta este un test generat automat. Te rugăm să completezi întrebările manual.',
                'questions' => [
                    [
                        'question' => 'Exemplu de întrebare?',
                        'type' => 'multiple_choice',
                        'options' => ['Opțiunea A', 'Opțiunea B', 'Opțiunea C', 'Opțiunea D'],
                        'correct_answer' => 0,
                        'explanation' => 'Explicația răspunsului corect'
                    ]
                ]
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * Create or update course, modules and lessons from Volt response
     */
    private function createOrUpdateCourseFromResponse($responseText, $teacherId = null, $existingCourseId = null)
    {
        try {
            // Parse JSON from response
            $courseData = $this->parseCourseData($responseText);
            
            if (!$courseData) {
                Log::warning('Could not parse course data from Formely AI response');
                return null;
            }

            $responseType = strtolower(trim((string) ($courseData['response_type'] ?? 'course')));
            if ($responseType !== 'course') {
                Log::warning('Formely AI response type does not allow course creation', [
                    'response_type' => $responseType,
                    'title' => $courseData['title'] ?? 'N/A',
                ]);
                return null;
            }

            Log::info('Creating/updating course from Formely AI response', [
                'title' => $courseData['title'] ?? 'N/A',
                'modules_count' => count($courseData['modules'] ?? []),
                'existing_course_id' => $existingCourseId
            ]);

            // Get teacher
            $teacher = null;
            if ($teacherId) {
                $teacher = User::find($teacherId);
            }
            if (!$teacher) {
                $teacher = Auth::user();
            }

            // Check if we should update existing course or create new one
            $course = null;
            if ($existingCourseId) {
                $course = Course::find($existingCourseId);
                if ($course && $course->teacher_id === $teacher->id) {
                    // Update existing course
                    $course->update([
                        'title' => $courseData['title'] ?? $course->title,
                        'description' => $courseData['description'] ?? $course->description,
                        'short_description' => $courseData['short_description'] ?? $course->short_description,
                    ]);
                    Log::info('Course updated', ['course_id' => $course->id]);
                    
                    // Delete existing modules and lessons to recreate them
                    $course->modules()->each(function($module) {
                        $module->lessons()->delete();
                    });
                    $course->modules()->delete();
                } else {
                    $course = null; // Course not found or not owned by teacher
                }
            }

            // Create new course if not updating
            if (!$course) {
                $course = $this->courseBuilderService->createCourse([
                    'title' => $courseData['title'] ?? 'Curs generat prin Formely AI',
                    'description' => $courseData['description'] ?? '',
                    'short_description' => $courseData['short_description'] ?? substr($courseData['description'] ?? '', 0, 150),
                    'status' => 'draft',
                    'teacher_id' => $teacher?->id,
                ], $teacher);
                Log::info('Course created', ['course_id' => $course->id]);
            }

            // Create modules and lessons
            $modules = $courseData['modules'] ?? [];
            Log::info('Creating modules', [
                'count' => count($modules),
                'modules_data' => array_map(function($m) {
                    return [
                        'title' => $m['title'] ?? 'N/A',
                        'lessons_count' => count($m['lessons'] ?? [])
                    ];
                }, $modules)
            ]);
            
            if (empty($modules)) {
                Log::error('No modules to create!', [
                    'course_data_keys' => array_keys($courseData),
                    'course_data_modules' => $courseData['modules'] ?? 'NOT SET'
                ]);
                throw new \Exception('Nu s-au găsit module în răspunsul Formely AI. Te rugăm să reformulezi cererea.');
            }
            
            foreach ($modules as $moduleIndex => $moduleData) {
                if (empty($moduleData['title'])) {
                    Log::warning('Skipping module without title', ['index' => $moduleIndex]);
                    continue;
                }
                
                try {
                    $module = $this->courseBuilderService->createModule($course, [
                        'title' => $moduleData['title'],
                        'description' => $moduleData['description'] ?? null,
                        'order' => $moduleIndex,
                        'status' => 'published',
                    ]);

                    Log::info('Module created', [
                        'module_id' => $module->id, 
                        'course_id' => $course->id,
                        'title' => $module->title
                    ]);

                    // Create lessons for this module
                    $lessons = $moduleData['lessons'] ?? [];
                    Log::info('Creating lessons for module', [
                        'module_id' => $module->id,
                        'lessons_count' => count($lessons),
                        'lessons_data' => array_map(function($l) {
                            return [
                                'title' => $l['title'] ?? 'N/A',
                                'has_content' => !empty($l['content'] ?? ''),
                                'content_length' => strlen($l['content'] ?? '')
                            ];
                        }, $lessons)
                    ]);
                    
                    if (empty($lessons)) {
                        Log::warning('Module has no lessons!', [
                            'module_id' => $module->id,
                            'module_title' => $module->title
                        ]);
                    }
                    
                    foreach ($lessons as $lessonIndex => $lessonData) {
                        if (empty($lessonData['title'])) {
                            Log::warning('Skipping lesson without title', [
                                'module_id' => $module->id,
                                'index' => $lessonIndex
                            ]);
                            continue;
                        }
                        
                        $lessonContent = (string) ($lessonData['content'] ?? '');
                        $lessonLines = $this->countLessonContentLines($lessonContent);
                        
                        if (empty($lessonContent)) {
                            Log::warning('Lesson content is empty', [
                                'module_id' => $module->id,
                                'lesson_title' => $lessonData['title']
                            ]);
                            throw new \Exception('Lecția "' . ($lessonData['title'] ?? 'fără titlu') . '" nu are conținut.');
                        } elseif ($lessonLines < $this->getMinLessonLines()) {
                            Log::warning('Lesson content is too short by lines rule', [
                                'module_id' => $module->id,
                                'lesson_title' => $lessonData['title'],
                                'content_lines' => $lessonLines,
                                'required_min_lines' => $this->getMinLessonLines()
                            ]);
                            throw new \Exception('Lecția "' . ($lessonData['title'] ?? 'fără titlu') . '" trebuie să aibă minimum ' . $this->getMinLessonLines() . ' de rânduri.');
                        }

                        $this->ensureLessonHasMinimumLines((string) ($lessonData['title'] ?? ''), $lessonContent);
                        
                        try {
                            $lesson = $this->courseBuilderService->createLesson($module, [
                                'title' => $lessonData['title'],
                                'content' => $lessonContent,
                                'order' => $lessonIndex,
                                'status' => 'published',
                                'type' => 'text',
                            ]);

                            Log::info('Lesson created', [
                                'lesson_id' => $lesson->id,
                                'module_id' => $module->id,
                                'course_id' => $course->id,
                                'title' => $lesson->title,
                                'content_length' => strlen($lesson->content)
                            ]);
                        } catch (\Exception $e) {
                            Log::error('Error creating lesson', [
                                'error' => $e->getMessage(),
                                'module_id' => $module->id,
                                'lesson_data' => $lessonData
                            ]);
                            throw $e;
                        }
                    }
                } catch (\Exception $e) {
                    Log::error('Error creating module', [
                        'error' => $e->getMessage(),
                        'module_data' => $moduleData
                    ]);
                    throw $e;
                }
            }
            
            // Refresh course to get updated counts
            $course->refresh();

            Log::info('Course creation completed', [
                'course_id' => $course->id,
                'modules_count' => $course->modules()->count(),
                'lessons_count' => $course->lessons()->count()
            ]);

            return $course;
        } catch (\Exception $e) {
            Log::error('Error creating course from Formely AI response', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    /**
     * Parse course data from Volt response
     */
    private function parseCourseData($responseText)
    {
        $data = $this->extractFirstJsonObjectFromText($responseText);
        if (!$data || !isset($data['title'])) {
            return null;
        }

        Log::info('Parsed course JSON candidate', ['modules_count' => count($data['modules'] ?? [])]);
        $validation = $this->validateAndNormalizeCourseData($data);
        if (!($validation['ok'] ?? false)) {
            Log::info('Parsed course JSON rejected', ['reasons' => $validation['reasons'] ?? []]);

            return null;
        }

        return $validation['data'];
    }

    /**
     * Extract the first JSON object from a text response without validating its course structure.
     */
    private function extractFirstJsonObjectFromText(string $responseText): ?array
    {
        $patterns = [
            '/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i',
            '/\{[\s\S]*\}/',
        ];

        foreach ($patterns as $pattern) {
            if (!preg_match($pattern, $responseText, $matches)) {
                continue;
            }

            $candidate = $matches[1] ?? $matches[0] ?? '';
            if ($candidate === '') {
                continue;
            }

            try {
                $data = json_decode($candidate, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                    return $data;
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to decode JSON candidate', ['error' => $e->getMessage()]);
            }
        }

        $startPos = strpos($responseText, '{');
        if ($startPos === false) {
            return null;
        }

        $jsonCandidate = substr($responseText, $startPos);
        $braceCount = 0;
        $endPos = -1;
        $length = strlen($jsonCandidate);
        for ($i = 0; $i < $length; $i++) {
            if ($jsonCandidate[$i] === '{') {
                $braceCount++;
            }
            if ($jsonCandidate[$i] === '}') {
                $braceCount--;
            }
            if ($braceCount === 0) {
                $endPos = $i + 1;
                break;
            }
        }

        if ($endPos <= 0) {
            return null;
        }

        $jsonStr = substr($jsonCandidate, 0, $endPos);
        try {
            $data = json_decode($jsonStr, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                return $data;
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to decode JSON by brace matching', ['error' => $e->getMessage()]);
        }

        return null;
    }

    /**
     * Extract lightweight metadata about the Volt response for the frontend.
     */
    private function extractAIResponseMetadataFromText(string $responseText): array
    {
        $data = $this->extractFirstJsonObjectFromText($responseText);
        if (!$data) {
            return [];
        }

        $metadata = [];
        $responseType = strtolower(trim((string) ($data['response_type'] ?? $data['type'] ?? '')));
        if ($responseType !== '') {
            $metadata['response_type'] = $responseType;
        }

        $clarificationQuestion = trim((string) (
            $data['clarification_question'] ??
            $data['question'] ??
            $data['message'] ??
            ''
        ));
        if ($clarificationQuestion !== '') {
            $metadata['clarification_question'] = $clarificationQuestion;
        }

        return $metadata;
    }

    /**
     * Validate builder diff plans before the frontend tries to apply them.
     */
    private function validateBuilderDiffPlanData(array $plan): array
    {
        $responseType = strtolower(trim((string) ($plan['response_type'] ?? $plan['type'] ?? '')));
        if ($responseType !== '' && !in_array($responseType, ['plan', 'builder_diff', 'clarification'], true)) {
            return [
                'valid' => false,
                'message' => 'Planul Formely AI are un tip de răspuns invalid.',
            ];
        }

        $operations = isset($plan['operations']) && is_array($plan['operations']) ? $plan['operations'] : [];
        $courseUpdates = isset($plan['course_updates']) && is_array($plan['course_updates']) ? $plan['course_updates'] : null;
        $summary = trim((string) ($plan['summary'] ?? ''));
        $clarificationQuestion = trim((string) ($plan['clarification_question'] ?? ''));

        if ($clarificationQuestion !== '') {
            return [
                'valid' => true,
                'clarification' => true,
                'clarification_question' => $clarificationQuestion,
                'operations' => $operations,
                'course_updates' => $courseUpdates,
            ];
        }

        if ($courseUpdates === null && empty($operations)) {
            return [
                'valid' => false,
                'message' => 'Planul Formely AI nu conține schimbări aplicabile.',
            ];
        }

        $lessonOperations = [];
        $moduleOperations = [];
        foreach ($operations as $op) {
            if (!is_array($op)) {
                return [
                    'valid' => false,
                    'message' => 'Planul Formely AI conține o operație invalidă.',
                ];
            }

            $opType = strtolower(trim((string) ($op['op'] ?? '')));
            if (in_array($opType, ['create_lesson', 'createlesson', 'update_lesson', 'updatelesson'], true)) {
                $lessonOperations[] = $op;
                $lessonContent = trim((string) ($op['content'] ?? $op['body'] ?? $op['html'] ?? ''));
                if ($opType === 'create_lesson' || $opType === 'createlesson') {
                    if ($lessonContent === '' || $this->countLessonContentLines($lessonContent) < 4) {
                        return [
                            'valid' => false,
                            'message' => 'Planul Formely AI conține o lecție fără conținut suficient.',
                        ];
                    }
                } elseif ($lessonContent !== '' && $this->countLessonContentLines($lessonContent) < 4) {
                    return [
                        'valid' => false,
                        'message' => 'Planul Formely AI conține o lecție actualizată cu conținut prea scurt.',
                    ];
                }
            }

            if (in_array($opType, ['create_module', 'createmodule', 'update_module', 'updatemodule'], true)) {
                $moduleOperations[] = $op;
                $nestedLessons = isset($op['lessons']) && is_array($op['lessons']) ? $op['lessons'] : [];
                if (($opType === 'create_module' || $opType === 'createmodule') && empty($nestedLessons)) {
                    return [
                        'valid' => false,
                        'message' => 'Planul Formely AI modifică module, dar nu include lecții.',
                    ];
                }
                foreach ($nestedLessons as $nestedLesson) {
                    if (!is_array($nestedLesson)) {
                        return [
                            'valid' => false,
                            'message' => 'Planul Formely AI conține o lecție invalidă în modul.',
                        ];
                    }
                    $nestedContent = trim((string) ($nestedLesson['content'] ?? $nestedLesson['body'] ?? $nestedLesson['html'] ?? ''));
                    if ($nestedContent === '' || $this->countLessonContentLines($nestedContent) < 4) {
                        return [
                            'valid' => false,
                            'message' => 'Planul Formely AI conține o lecție de modul fără conținut suficient.',
                        ];
                    }
                }
            }
        }

        if (!empty($moduleOperations) && empty($lessonOperations)) {
            return [
                'valid' => false,
                'message' => 'Planul Formely AI modifică module, dar nu conține lecții.',
            ];
        }

        return [
            'valid' => true,
            'summary' => $summary,
            'course_updates' => $courseUpdates,
            'operations' => $operations,
        ];
    }

    private function countLessonContentLines(string $content): int
    {
        if (trim($content) === '') {
            return 0;
        }

        $normalized = preg_replace('/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/i', "\n", $content) ?? $content;
        $plain = html_entity_decode(strip_tags($normalized), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $plain = str_replace("\r\n", "\n", $plain);
        $plain = str_replace("\r", "\n", $plain);

        $lines = preg_split('/\n+/', $plain) ?: [];
        $nonEmptyLines = array_filter($lines, static function ($line) {
            return trim((string) $line) !== '';
        });

        $lineCount = count($nonEmptyLines);

        // If AI returns dense paragraphs, approximate useful "lines"
        // by counting sentence-like chunks too.
        $sentenceChunks = preg_split('/(?<=[\.\!\?])\s+|[;\n]+/u', trim($plain)) ?: [];
        $sentenceCount = count(array_filter($sentenceChunks, static function ($chunk) {
            return mb_strlen(trim((string) $chunk)) >= 20;
        }));

        return max($lineCount, $sentenceCount);
    }

    private function ensureLessonHasMinimumLines(string $lessonTitle, string $lessonContent): void
    {
        $lineCount = $this->countLessonContentLines($lessonContent);
        if ($lineCount < $this->getMinLessonLines()) {
            throw new \RuntimeException(
                'Lecția "' . ($lessonTitle !== '' ? $lessonTitle : 'fără titlu') . '" trebuie să aibă minimum ' . $this->getMinLessonLines() . ' rânduri de conținut util.'
            );
        }
    }

    /**
     * Validate and normalize course data.
     *
     * @return array{ok: true, data: array}|array{ok: false, reasons: string[]}
     */
    private function validateAndNormalizeCourseData($data): array
    {
        if (!is_array($data)) {
            Log::warning('Course data is not an array');

            return ['ok' => false, 'reasons' => ['Răspunsul nu este un obiect JSON de curs.']];
        }

        $responseType = strtolower(trim((string) ($data['response_type'] ?? 'course')));
        if ($responseType !== 'course') {
            Log::warning('Course schema rejected due to response type', [
                'response_type' => $responseType,
            ]);

            return ['ok' => false, 'reasons' => ['response_type trebuie să fie "course" (primit: "' . ($data['response_type'] ?? 'lipsă') . '").']];
        }

        $title = trim((string) ($data['title'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $shortDescription = trim((string) ($data['short_description'] ?? ''));

        if ($title === '' || $description === '') {
            Log::warning('Course schema rejected due to missing title or description', [
                'has_title' => $title !== '',
                'has_description' => $description !== '',
            ]);

            return ['ok' => false, 'reasons' => ['Lipsesc title sau description (ambele obligatorii).']];
        }

        if (!isset($data['modules']) || !is_array($data['modules']) || empty($data['modules'])) {
            Log::warning('No modules found in parsed data');

            return ['ok' => false, 'reasons' => ['Lipsește modules sau este gol.']];
        }

        $modulesCount = count($data['modules']);
        if ($modulesCount < 2) {
            Log::warning('Insufficient modules', [
                'required' => 2,
                'found' => $modulesCount,
            ]);

            return ['ok' => false, 'reasons' => ['Sunt necesare minimum 2 module (ai trimis ' . $modulesCount . ').']];
        }

        $normalizedModules = [];
        foreach ($data['modules'] as $moduleIndex => $module) {
            if (!is_array($module)) {
                Log::warning('Invalid module shape', [
                    'module_index' => $moduleIndex,
                ]);

                return ['ok' => false, 'reasons' => ['Modul la index ' . $moduleIndex . ' nu are formă validă.']];
            }

            $moduleTitle = trim((string) ($module['title'] ?? ''));
            if ($moduleTitle === '') {
                Log::warning('Invalid module title', [
                    'module_index' => $moduleIndex,
                ]);

                return ['ok' => false, 'reasons' => ['Modulul de la index ' . $moduleIndex . ' nu are title.']];
            }

            $normalizedModule = [
                'title' => $moduleTitle,
                'description' => isset($module['description']) ? trim((string) $module['description']) : null,
                'lessons' => [],
            ];

            if (!isset($module['lessons']) || !is_array($module['lessons']) || empty($module['lessons'])) {
                Log::warning('Module is missing lessons array', [
                    'module_title' => $moduleTitle,
                    'module_index' => $moduleIndex,
                ]);

                return ['ok' => false, 'reasons' => ['Modulul "' . $moduleTitle . '" nu are lecții în array-ul lessons.']];
            }

            foreach ($module['lessons'] as $lessonIndex => $lesson) {
                if (!is_array($lesson)) {
                    Log::warning('Invalid lesson shape', [
                        'module_title' => $moduleTitle,
                        'module_index' => $moduleIndex,
                        'lesson_index' => $lessonIndex,
                    ]);

                    return ['ok' => false, 'reasons' => ['Lecția de la index ' . $lessonIndex . ' în modulul "' . $moduleTitle . '" nu are formă validă.']];
                }

                $lessonTitle = trim((string) ($lesson['title'] ?? ''));
                if ($lessonTitle === '') {
                    Log::warning('Invalid lesson title', [
                        'module_title' => $moduleTitle,
                        'module_index' => $moduleIndex,
                        'lesson_index' => $lessonIndex,
                    ]);

                    return ['ok' => false, 'reasons' => ['O lecție din modulul "' . $moduleTitle . '" nu are title.']];
                }

                $lessonContent = trim((string) ($lesson['content'] ?? ''));
                if ($lessonContent === '') {
                    Log::warning('Invalid lesson content: empty', [
                        'module_title' => $moduleTitle,
                        'lesson_title' => $lessonTitle,
                        'lesson_index' => $lessonIndex,
                    ]);

                    return ['ok' => false, 'reasons' => ['Lecția "' . $lessonTitle . '" (modul "' . $moduleTitle . '") are content gol.']];
                }

                $lineCount = $this->countLessonContentLines($lessonContent);
                if ($lineCount < $this->getMinLessonLines()) {
                    // Nu respingem cursul doar pentru că o lecție e mai scurtă.
                    // Pe Groq free tier regenerările suplimentare epuizează TPM-ul și blochează crearea.
                    Log::warning('Lesson content is shorter than preferred minimum; accepting anyway', [
                        'module_title' => $moduleTitle,
                        'lesson_title' => $lessonTitle,
                        'required_min_lines' => $this->getMinLessonLines(),
                        'found_lines' => $lineCount,
                    ]);
                }

                $normalizedModule['lessons'][] = [
                    'title' => $lessonTitle,
                    'content' => $lessonContent,
                ];
            }

            $lessonsCount = count($normalizedModule['lessons']);
            if ($lessonsCount < 2) {
                Log::warning('Module has insufficient lessons', [
                    'module_title' => $moduleTitle,
                    'required' => 2,
                    'found' => $lessonsCount,
                ]);

                return ['ok' => false, 'reasons' => ['Modulul "' . $moduleTitle . '" trebuie să aibă minimum 2 lecții (ai ' . $lessonsCount . ').']];
            }

            $normalizedModules[] = $normalizedModule;
        }

        if (empty($normalizedModules)) {
            Log::warning('No valid modules with lessons found after normalization');

            return ['ok' => false, 'reasons' => ['Nu s-au putut normaliza modulele.']];
        }

        if (count($normalizedModules) < 2) {
            Log::warning('Final validation failed: insufficient modules', [
                'required' => 2,
                'found' => count($normalizedModules),
            ]);

            return ['ok' => false, 'reasons' => ['După normalizare sunt sub 2 module valide.']];
        }

        return [
            'ok' => true,
            'data' => [
                'response_type' => $responseType,
                'title' => $title,
                'description' => $description,
                'short_description' => $shortDescription !== '' ? $shortDescription : substr($description, 0, 150),
                'modules' => $normalizedModules,
            ],
        ];
    }

    /**
     * Check if the request is a clarification or modification request
     */
    private function isClarificationRequest($prompt, $messages)
    {
        $promptLower = strtolower(trim($prompt));
        
        // Cuvinte cheie care indică clarificare/modificare
        $clarificationKeywords = [
            'modifică', 'modifica', 'schimbă', 'schimba', 'change', 'modify',
            'nu vreau', "don't want", 'nu e bine', 'nu e corect',
            'corectează', 'corecteaza', 'correct', 'fix',
            'întrebare', 'intrebare', 'question', 'clarifică', 'clarifica', 'clarify',
            'ce înseamnă', 'ce inseamna', 'what does', 'explică', 'explain',
            'mai multe', 'more', 'detalii', 'details',
            'altfel', 'diferit', 'different', 'alt', 'other'
        ];
        
        foreach ($clarificationKeywords as $keyword) {
            if (strpos($promptLower, $keyword) !== false) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check if response contains valid course JSON
     */
    private function hasValidCourseJson($responseText)
    {
        // Try to extract JSON from response
        $jsonMatch = preg_match('/\{[\s\S]*\}/', $responseText, $matches);
        if ($jsonMatch && isset($matches[0])) {
            try {
                $data = json_decode($matches[0], true);
                if (json_last_error() === JSON_ERROR_NONE && isset($data['title'])) {
                    return true;
                }
            } catch (\Exception $e) {
                return false;
            }
        }
        return false;
    }
}
