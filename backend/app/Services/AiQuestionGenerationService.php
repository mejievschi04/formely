<?php

namespace App\Services;

use App\Models\ContentBlock;
use App\Models\Course;
use App\Models\Lesson;
use Illuminate\Support\Facades\Log;

/**
 * Shared Formely AI question generation from course content.
 * Used by question banks and test creator flows.
 */
class AiQuestionGenerationService
{
    protected TestBuilderService $testBuilderService;

    public function __construct(TestBuilderService $testBuilderService)
    {
        $this->testBuilderService = $testBuilderService;
    }

    /**
     * Load course with modules, lessons and content blocks for AI extraction.
     */
    public function loadCourseWithContentForAi(int $courseId): Course
    {
        return $this->loadCourseWithContentForAiInternal($courseId);
    }

    /**
     * Whether the course has enough extractable lesson content.
     */
    public function courseHasExtractableContent(Course $course): bool
    {
        return $this->courseHasExtractableContentInternal($course);
    }

    /**
     * Extract study material from course, optionally scoped to module or lesson.
     */
    public function extractCourseContent(Course $course, ?int $moduleId = null, ?int $lessonId = null): string
    {
        return $this->extractCourseContentInternal($course, $moduleId, $lessonId);
    }

    /**
     * Generate validated questions from extracted course content.
     *
     * @param list<string> $questionTypes
     * @return list<array<string, mixed>>
     */
    public function generateQuestionsFromContent(
        string $courseContent,
        int $numberOfQuestions,
        string $difficulty = 'medium',
        array $questionTypes = ['multiple_choice'],
        string $qualityMode = 'balanced',
        array $cognitiveLevels = []
    ): array {
        return $this->generateQuestionsWithAI($courseContent, $numberOfQuestions, $difficulty, $questionTypes, $qualityMode, $cognitiveLevels);
    }

    /**
     * Generate a single review draft question (approval flow).
     *
     * @param list<string> $questionTypes
     * @return list<array<string, mixed>>
     */
    public function generateReviewDraftQuestion(
        string $courseContent,
        string $difficulty,
        array $questionTypes = ['multiple_choice'],
        string $extraInstructions = '',
        array $approvedQuestions = [],
        array $blockedQuestions = [],
        array $cognitiveLevels = []
    ): array {
        return $this->generateReviewDraftQuestionWithAI(
            $courseContent,
            $difficulty,
            $questionTypes,
            $extraInstructions,
            $approvedQuestions,
            $blockedQuestions,
            $cognitiveLevels
        );
    }

    /**
     * Suggest test title and description from course metadata.
     *
     * @return array{title: string, description: string}
     */
    public function suggestTestMetadata(Course $course, string $testType = 'practice'): array
    {
        $typeLabels = [
            'practice' => 'Test de practică',
            'graded' => 'Test evaluativ',
            'final' => 'Test final',
        ];
        $label = $typeLabels[$testType] ?? 'Test';
        $title = trim($label . ': ' . ($course->title ?? 'Curs'));
        $description = 'Test generat automat din conținutul cursului „' . ($course->title ?? '') . '”.';

        return [
            'title' => $title,
            'description' => $description,
        ];
    }

    /**
     * Suggest test title and description from an uploaded document.
     *
     * @return array{title: string, description: string}
     */
    public function suggestTestMetadataFromDocument(string $fileName, string $testType = 'practice'): array
    {
        $typeLabels = [
            'practice' => 'Test de practică',
            'graded' => 'Test evaluativ',
            'final' => 'Test final',
        ];
        $label = $typeLabels[$testType] ?? 'Test';
        $baseName = pathinfo($fileName, PATHINFO_FILENAME) ?: $fileName;
        $title = trim($label . ': ' . $baseName);
        $description = 'Test generat automat din fișierul „' . $fileName . '”.';

        return [
            'title' => $title,
            'description' => $description,
        ];
    }

    public function formatDocumentContent(string $fileName, string $text, ?string $type = null): string
    {
        $normalized = $this->normalizeExtractedText(trim($text));
        if ($normalized === '') {
            return '';
        }

        $header = 'Sursă document: ' . $fileName;
        if ($type) {
            $header .= ' (' . $type . ')';
        }

        return $header . "\n\n" . $normalized;
    }

    public function documentHasExtractableContent(string $text): bool
    {
        return mb_strlen(trim(strip_tags($text))) >= 80;
    }

    /**
     * Attach source metadata for document-based generation.
     *
     * @param list<array<string, mixed>> $questions
     * @return list<array<string, mixed>>
     */
    public function enrichQuestionsWithDocumentMetadata(
        array $questions,
        string $fileName,
        string $difficulty,
        ?string $documentType = null,
        ?string $qualityMode = null,
        array $cognitiveLevels = []
    ): array {
        $timestamp = now()->toIso8601String();
        $cognitiveLevels = AiPromptService::normalizeCognitiveLevelList($cognitiveLevels);
        foreach ($questions as &$question) {
            if (!is_array($question)) {
                continue;
            }
            $meta = is_array($question['metadata'] ?? null) ? $question['metadata'] : [];
            $meta['source_type'] = 'document';
            $meta['source_file_name'] = $fileName;
            if ($documentType) {
                $meta['source_file_type'] = $documentType;
            }
            $meta['ai_difficulty'] = $difficulty;
            if ($qualityMode !== null) {
                $meta['ai_quality_mode'] = $this->normalizeQualityMode($qualityMode);
            }
            if (!empty($cognitiveLevels)) {
                $meta['ai_cognitive_levels'] = $cognitiveLevels;
                if (isset($question['cognitive_level']) && in_array((string) $question['cognitive_level'], $cognitiveLevels, true)) {
                    $meta['ai_cognitive_level'] = (string) $question['cognitive_level'];
                }
            }
            $meta['ai_generated_at'] = $timestamp;
            $question['metadata'] = $meta;
            if (!isset($question['difficulty'])) {
                $question['difficulty'] = $difficulty;
            }
        }
        unset($question);

        return $questions;
    }

    /**
     * Attach source metadata to generated questions for instructor review.
     *
     * @param list<array<string, mixed>> $questions
     * @return list<array<string, mixed>>
     */
    public function enrichQuestionsWithSourceMetadata(
        array $questions,
        int $courseId,
        string $difficulty,
        ?int $moduleId = null,
        ?int $lessonId = null,
        ?string $qualityMode = null,
        array $cognitiveLevels = []
    ): array {
        $timestamp = now()->toIso8601String();
        $cognitiveLevels = AiPromptService::normalizeCognitiveLevelList($cognitiveLevels);
        foreach ($questions as &$question) {
            if (!is_array($question)) {
                continue;
            }
            $meta = is_array($question['metadata'] ?? null) ? $question['metadata'] : [];
            $meta['source_course_id'] = $courseId;
            if ($moduleId !== null) {
                $meta['source_module_id'] = $moduleId;
            }
            if ($lessonId !== null) {
                $meta['source_lesson_id'] = $lessonId;
            }
            $meta['ai_difficulty'] = $difficulty;
            if ($qualityMode !== null) {
                $meta['ai_quality_mode'] = $this->normalizeQualityMode($qualityMode);
            }
            if (!empty($cognitiveLevels)) {
                $meta['ai_cognitive_levels'] = $cognitiveLevels;
                if (isset($question['cognitive_level']) && in_array((string) $question['cognitive_level'], $cognitiveLevels, true)) {
                    $meta['ai_cognitive_level'] = (string) $question['cognitive_level'];
                }
            }
            $meta['ai_generated_at'] = $timestamp;
            $question['metadata'] = $meta;
            if (!isset($question['difficulty'])) {
                $question['difficulty'] = $difficulty;
            }
        }
        unset($question);

        return $questions;
    }

private function loadCourseWithContentForAiInternal(int $courseId): Course
{
    return Course::with([
        'modules.lessons' => function ($query) {
            $query->orderBy('order')->with(['contentBlocks' => function ($blockQuery) {
                $blockQuery->orderBy('order');
            }]);
        },
        'lessons' => function ($query) {
            $query->whereNull('module_id')->orderBy('order')->with(['contentBlocks' => function ($blockQuery) {
                $blockQuery->orderBy('order');
            }]);
        },
    ])->findOrFail($courseId);
}

/**
 * Extract course content for AI processing (legacy lesson.content + content blocks).
 */
private function extractCourseContentInternal(Course $course, ?int $moduleId = null, ?int $lessonId = null): string
{
    $materialSections = [];

    foreach ($course->modules as $module) {
        if ($moduleId !== null && (int) $module->id !== $moduleId) {
            continue;
        }

        foreach ($module->lessons as $lesson) {
            if ($lessonId !== null && (int) $lesson->id !== $lessonId) {
                continue;
            }

            $section = $this->formatLessonSection($lesson);
            if ($section !== '') {
                $materialSections[] = $section;
            }
        }
    }

    if ($moduleId === null && $lessonId === null) {
        $rootLessons = ($course->relationLoaded('lessons') ? $course->lessons : collect())
            ->filter(fn ($lesson) => $lesson instanceof Lesson && $lesson->module_id === null);

        foreach ($rootLessons as $lesson) {
            $section = $this->formatLessonSection($lesson);
            if ($section !== '') {
                $materialSections[] = $section;
            }
        }
    }

    $material = trim(implode("\n\n", $materialSections));

    // Light context header (titlu + descriere) only so Formely AI knows the domain,
    // followed by the actual study material that questions must be based on.
    $header = 'Subiect curs: ' . (string) $course->title;
    $courseDescription = $this->normalizeExtractedText(strip_tags((string) ($course->description ?? '')));
    if ($courseDescription !== '') {
        $header .= "\nContext: " . $courseDescription;
    }

    $content = $header . "\n\n=== MATERIAL DE STUDIU (genereaza intrebari STRICT din textul de mai jos) ===\n" . $material;

    return $this->compactCourseContentForQuestions($content);
}

private function formatLessonSection(Lesson $lesson): string
{
    $lessonText = $this->extractLessonText($lesson);
    if ($lessonText === '') {
        return '';
    }

    return '## ' . (string) $lesson->title . "\n" . $lessonText;
}

private function extractLessonText(Lesson $lesson): string
{
    $parts = [];

    $legacyContent = $this->htmlToPlainText((string) ($lesson->content ?? ''));
    if ($legacyContent !== '') {
        $parts[] = $legacyContent;
    }

    $blocks = $lesson->relationLoaded('contentBlocks')
        ? ($lesson->contentBlocks ?? collect())
        : $lesson->contentBlocks()->orderBy('order')->get();

    foreach ($blocks as $block) {
        if (!$block instanceof ContentBlock || $block->visible === false) {
            continue;
        }

        $source = $this->htmlToPlainText((string) ($block->source ?? ''));
        if ($source !== '') {
            $parts[] = $source;
        }

        $payloadText = $this->extractPayloadText($block->payload);
        if ($payloadText !== '') {
            $parts[] = $payloadText;
        }
    }

    return $this->normalizeExtractedText(implode("\n", array_filter($parts)));
}

private function extractPayloadText(mixed $payload): string
{
    if (is_string($payload)) {
        return $this->htmlToPlainText($payload);
    }

    if (!is_array($payload)) {
        return '';
    }

    $parts = [];
    foreach (['content', 'body', 'html', 'text', 'description', 'title', 'link_text'] as $key) {
        if (!empty($payload[$key]) && is_string($payload[$key])) {
            $parts[] = $this->htmlToPlainText($payload[$key]);
        }
    }

    if (!empty($payload['images']) && is_array($payload['images'])) {
        foreach ($payload['images'] as $image) {
            if (is_string($image) && trim($image) !== '') {
                $parts[] = $image;
            } elseif (is_array($image)) {
                foreach (['caption', 'alt', 'title'] as $imageKey) {
                    if (!empty($image[$imageKey]) && is_string($image[$imageKey])) {
                        $parts[] = $image[$imageKey];
                    }
                }
            }
        }
    }

    return $this->normalizeExtractedText(implode("\n", array_filter($parts)));
}

private function normalizeExtractedText(string $text): string
{
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

    return trim($text);
}

private function htmlToPlainText(string $html): string
{
    $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/<(br|hr)\s*\/?>/iu', '. ', $text) ?? $text;
    $text = preg_replace('/<\/(p|div|section|article|h[1-6]|li|tr|td|th)>/iu', '. ', $text) ?? $text;
    $text = strip_tags($text);
    $text = preg_replace('/\s*([.!?])\s*([.!?])+/u', '$1', $text) ?? $text;

    return $this->normalizeExtractedText($text);
}

private function courseHasExtractableContentInternal(Course $course): bool
{
    foreach ($course->modules as $module) {
        foreach ($module->lessons as $lesson) {
            if (mb_strlen($this->extractLessonText($lesson)) >= 40) {
                return true;
            }
        }
    }

    $rootLessons = ($course->relationLoaded('lessons') ? $course->lessons : collect())
        ->filter(fn ($lesson) => $lesson instanceof Lesson && $lesson->module_id === null);

    foreach ($rootLessons as $lesson) {
        if (mb_strlen($this->extractLessonText($lesson)) >= 40) {
            return true;
        }
    }

    return false;
}

/**
 * Compact course content so question-generation prompts stay under model limits.
 */
private function compactCourseContentForQuestions(string $courseContent, int $maxChars = 12000): string
{
    $courseContent = trim($courseContent);
    if ($courseContent === '' || mb_strlen($courseContent) <= $maxChars) {
        return $courseContent;
    }

    return rtrim(mb_substr($courseContent, 0, max(0, $maxChars - 80))) . "\n[continut suplimentar omis]";
}

private function normalizeQualityMode(string $qualityMode): string
{
    return in_array($qualityMode, ['fast', 'balanced', 'high_stakes'], true)
        ? $qualityMode
        : 'balanced';
}

/**
 * Tune retry depth for AI test generation.
 */
private function getQualityModeConfig(string $qualityMode): array
{
    return match ($this->normalizeQualityMode($qualityMode)) {
        'fast' => [
            'max_batch_rounds' => 3,
            'empty_round_limit' => 1,
            'max_attempts_per_slot' => 1,
            'temperature_base' => 0.18,
            'temperature_step' => 0.12,
        ],
        'high_stakes' => [
            'max_batch_rounds' => 8,
            'empty_round_limit' => 3,
            'max_attempts_per_slot' => 6,
            'temperature_base' => 0.16,
            'temperature_step' => 0.10,
        ],
        default => [
            'max_batch_rounds' => 6,
            'empty_round_limit' => 2,
            'max_attempts_per_slot' => 4,
            'temperature_base' => 0.2,
            'temperature_step' => 0.15,
        ],
    };
}

/**
 * Generate questions using AI
 */
private function generateQuestionsWithAI(
    string $courseContent,
    int $numberOfQuestions,
    string $difficulty,
    array $questionTypes = ['multiple_choice'],
    string $qualityMode = 'balanced',
    array $cognitiveLevels = []
): array
{
    try {
        return $this->generateAutoQuestionsSequentially($courseContent, $numberOfQuestions, $difficulty, $questionTypes, $qualityMode, $cognitiveLevels);
    } catch (\Exception $e) {
        Log::error('Error generating questions with AI', [
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
        // Rethrow so the caller (endpoint) can return a meaningful HTTP error
        throw $e;
    }
}

/**
 * Generate multiple questions one by one so we can recover from weak model output.
 */
private function generateAutoQuestionsSequentially(
    string $courseContent,
    int $numberOfQuestions,
    string $difficulty,
    array $questionTypes = ['multiple_choice'],
    string $qualityMode = 'balanced',
    array $cognitiveLevels = []
): array
{
    $typeList = $this->normalizeAiQuestionTypes($questionTypes);
    $cognitiveLevels = AiPromptService::normalizeCognitiveLevelList($cognitiveLevels);
    $qualityConfig = $this->getQualityModeConfig($qualityMode);

    $generatedQuestions = [];
    $usedQuestionContents = [];
    $usedNormalizedContents = [];

    // Register a candidate if it is non-empty, not a duplicate and not a meta question.
    $registerCandidate = function ($candidate) use (
        &$generatedQuestions,
        &$usedQuestionContents,
        &$usedNormalizedContents,
        $numberOfQuestions
    ): bool {
        if (count($generatedQuestions) >= $numberOfQuestions || !is_array($candidate)) {
            return false;
        }

        $content = trim((string) ($candidate['content'] ?? $candidate['question'] ?? ''));
        if ($content === '') {
            return false;
        }

        $normalized = $this->normalizeAiQuestionText($content);
        if ($normalized !== '' && in_array($normalized, $usedNormalizedContents, true)) {
            return false;
        }

        $generatedQuestions[] = $candidate;
        $usedQuestionContents[] = $content;
        if ($normalized !== '') {
            $usedNormalizedContents[] = $normalized;
        }

        return true;
    };

    // Multi-round batch generation: keep asking the model (passing already
    // generated questions so it avoids repeats) until we reach the target
    // count or stop making progress. This is the "analyze until it finds a
    // question" behaviour — we never settle for a generic default while the
    // model can still produce real, content-based questions.
    $maxBatchRounds = (int) $qualityConfig['max_batch_rounds'];
    $emptyRoundLimit = (int) $qualityConfig['empty_round_limit'];
    $emptyRounds = 0;
    for ($round = 0; $round < $maxBatchRounds && count($generatedQuestions) < $numberOfQuestions; $round++) {
        $remaining = $numberOfQuestions - count($generatedQuestions);
        // Slight temperature ramp adds diversity on later rounds.
        $temperature = min(0.9, ((float) $qualityConfig['temperature_base']) + ($round * (float) $qualityConfig['temperature_step']));
        $preferredType = count($typeList) > 1
            ? $typeList[$round % count($typeList)]
            : '';
        $batchSize = count($typeList) > 1
            ? min($remaining, max(1, min(3, (int) ceil($remaining / 2))))
            : $remaining;

        $batchQuestions = $this->generateBatchQuestionsWithAI(
            $courseContent,
            $batchSize,
            $difficulty,
            $typeList,
            $usedQuestionContents,
            $temperature,
                $preferredType,
                $cognitiveLevels
        );

        $addedThisRound = 0;
        foreach ($batchQuestions as $candidate) {
            if ($registerCandidate($candidate)) {
                $addedThisRound++;
            }
        }

        if ($addedThisRound === 0) {
            $emptyRounds++;
            // Two consecutive unproductive rounds → move to single-question retries.
                if ($emptyRounds >= $emptyRoundLimit) {
                break;
            }
        } else {
            $emptyRounds = 0;
        }
    }

    // Single-question retries for any remaining slots. Each slot gets several
    // attempts with rising temperature before we give up on that slot.
    $maxAttemptsPerSlot = (int) $qualityConfig['max_attempts_per_slot'];
    while (count($generatedQuestions) < $numberOfQuestions) {
        $slotFilledOrExhausted = false;

        for ($attempt = 0; $attempt < $maxAttemptsPerSlot; $attempt++) {
            $temperature = min(0.95, 0.3 + ($attempt * 0.2));
            $preferredType = $typeList[count($generatedQuestions) % count($typeList)];
            $candidate = $this->generateSingleAiQuestion(
                $courseContent,
                $difficulty,
                $typeList,
                $usedQuestionContents,
                $temperature,
                $preferredType,
                $cognitiveLevels
            );

            if ($candidate !== null && $registerCandidate($candidate)) {
                $slotFilledOrExhausted = true;
                break;
            }
        }

        // If a full set of attempts produced nothing new, stop trying for more
        // slots — the material likely cannot support additional unique questions.
        if (!$slotFilledOrExhausted) {
            break;
        }
    }

    // Absolute last resort: only if the model produced nothing at all, return a
    // single content-based deterministic question so the UI is not empty.
    if (empty($generatedQuestions)) {
        if ($this->normalizeQualityMode($qualityMode) === 'high_stakes') {
            return [];
        }
        $fallbackQuestion = $this->buildDeterministicFallbackReviewQuestion($courseContent, $difficulty, 0);
        return $this->formatQuestionsForDatabase([$fallbackQuestion]);
    }

    return $generatedQuestions;
}

/**
 * Single AI question attempt for the auto-generate flow.
 * Returns a DB-formatted, strong, non-meta question or null (so the caller can retry).
 * Unlike generateReviewDraftQuestionWithAI, this NEVER returns a deterministic default.
 */
private function generateSingleAiQuestion(
    string $courseContent,
    string $difficulty,
    array $questionTypes,
    array $usedQuestions = [],
    float $temperature = 0.3,
    string $preferredType = '',
    array $cognitiveLevels = []
): ?array {
    try {
        $courseContent = $this->compactCourseContentForQuestions($courseContent);
        $typeList = $this->normalizeAiQuestionTypes($questionTypes);
        $usedQuestions = array_values(array_filter(array_unique(array_map('strval', $usedQuestions))));

        $prompt = $this->buildQuestionGenerationPrompt(
            $courseContent,
            $difficulty,
            $typeList,
            $usedQuestions,
            '',
            $preferredType,
            $cognitiveLevels
        );

        $response = $this->callAI($prompt, 512, $temperature);
        $questions = $this->parseAIResponse($response);
        $questions = $this->filterStrongAiQuestions($questions, 1, $usedQuestions);

        if (empty($questions)) {
            return null;
        }

        $formatted = $this->formatQuestionsForDatabase($questions);

        return $formatted[0] ?? null;
    } catch (\Exception $e) {
        Log::warning('Single AI question attempt failed', [
            'error' => $e->getMessage(),
        ]);
        return null;
    }
}

/**
 * Generate multiple questions in a single AI call (fast path for auto-generate).
 * Returns DB-formatted questions; empty array if the call fails or yields nothing usable.
 */
private function generateBatchQuestionsWithAI(
    string $courseContent,
    int $numberOfQuestions,
    string $difficulty,
    array $questionTypes,
    array $usedQuestions = [],
    float $temperature = 0.2,
    string $preferredType = '',
    array $cognitiveLevels = []
): array {
    try {
        $courseContent = $this->compactCourseContentForQuestions($courseContent);
        $usedQuestions = array_values(array_filter(array_unique(array_map('strval', $usedQuestions))));
        $typeList = $this->normalizeAiQuestionTypes($questionTypes);
        if ($preferredType !== '' && in_array($preferredType, $typeList, true)) {
            $typeList = [$preferredType];
        }
        $prompt = AiPromptService::buildBatchQuestionGenerationPrompt(
            $courseContent,
            $difficulty,
            $typeList,
            $numberOfQuestions,
            $usedQuestions,
            $cognitiveLevels
        );

        // Roughly size the token budget to the number of requested questions.
        $maxTokens = max(700, min(4000, $numberOfQuestions * 320));
        $response = $this->callAI($prompt, $maxTokens, $temperature);
        $questions = $this->parseAIResponse($response);
        $questions = $this->filterStrongAiQuestions($questions, $numberOfQuestions, $usedQuestions);

        return $this->formatQuestionsForDatabase($questions);
    } catch (\Exception $e) {
        Log::warning('Batch AI question generation failed; falling back to sequential', [
            'error' => $e->getMessage(),
        ]);
        return [];
    }
}

/**
 * Generate a single review draft question for the AI approval flow.
 */
private function generateReviewDraftQuestionWithAI(
    string $courseContent,
    string $difficulty,
    array $questionTypes = ['multiple_choice'],
    string $extraInstructions = '',
    array $approvedQuestions = [],
    array $blockedQuestions = [],
    array $cognitiveLevels = []
): array {
    try {
        $courseContent = $this->compactCourseContentForQuestions($courseContent);
        $typeList = $this->normalizeAiQuestionTypes($questionTypes);
        $typeHint = implode(', ', $typeList);
        $usedQuestions = array_values(array_filter(array_unique(array_merge($approvedQuestions, $blockedQuestions))));

        $prompt = $this->buildQuestionGenerationPrompt(
            $courseContent,
            $difficulty,
            $typeList,
            $usedQuestions,
            $extraInstructions,
            '',
            $cognitiveLevels
        );

        $response = $this->callAI($prompt, 512);
        $questions = $this->parseAIResponse($response);
        $questions = $this->filterStrongAiQuestions($questions, 1, $usedQuestions);

        if (empty($questions)) {
            Log::warning('AI review draft returned no acceptable questions on first attempt', [
                'response_preview' => substr($response, 0, 500),
                'type_hint' => $typeHint,
            ]);

            $fallbackPrompt = $this->buildFallbackReviewPrompt($courseContent, $difficulty, $typeHint);
            if (!empty($usedQuestions)) {
                $fallbackPrompt .= "\nIntrebari deja folosite sau respinse:\n";
                foreach ($usedQuestions as $index => $usedQuestion) {
                    $fallbackPrompt .= ($index + 1) . '. ' . $usedQuestion . "\n";
                }
                $fallbackPrompt .= "\n";
            }
            $fallbackResponse = $this->callAI($fallbackPrompt, 384);
            $fallbackQuestions = $this->parseAIResponse($fallbackResponse);
            $fallbackQuestions = $this->filterStrongAiQuestions($fallbackQuestions, 1, $usedQuestions);

            if (!empty($fallbackQuestions)) {
                return $this->formatQuestionsForDatabase($fallbackQuestions);
            }

            Log::warning('AI review draft returned no acceptable questions after fallback attempt', [
                'response_preview' => substr($fallbackResponse, 0, 500),
                'type_hint' => $typeHint,
            ]);

            $deterministicFallback = $this->buildUniqueDeterministicFallbackReviewQuestion(
                $courseContent,
                $difficulty,
                $usedQuestions
            );
            Log::warning('Using deterministic fallback review question', [
                'content_preview' => mb_substr((string) ($deterministicFallback['content'] ?? ''), 0, 160),
                'difficulty' => $difficulty,
            ]);
            return $this->formatQuestionsForDatabase([$deterministicFallback]);
        }

        return $this->formatQuestionsForDatabase($questions);
    } catch (\Exception $e) {
        Log::error('Error generating review draft with AI', [
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
        throw $e;
    }
}

/**
 * Build the unified prompt used for question generation.
 */
private function buildQuestionGenerationPrompt(
    string $courseContent,
    string $difficulty,
    array $questionTypes,
    array $usedQuestions = [],
    string $extraInstructions = '',
    string $preferredType = '',
    array $cognitiveLevels = []
): string {
    return AiPromptService::buildQuestionGenerationPrompt(
        $courseContent,
        $difficulty,
        $questionTypes,
        $usedQuestions,
        $extraInstructions,
            $preferredType,
            $cognitiveLevels
    );
}

/**
 * @return list<string>
 */
private function normalizeAiQuestionTypes(array $questionTypes): array
{
    return AiPromptService::normalizeQuestionTypeList($questionTypes);
}
/**
 * Keep only questions that look structurally strong enough for manual review.
 */
private function filterStrongAiQuestions(array $questions, int $minLength = 1, array $blockedQuestions = []): array
{
    $filtered = [];
    $blockedQuestions = array_values(array_filter(array_map('strval', $blockedQuestions)));

    foreach ($questions as $question) {
        if (!is_array($question)) {
            continue;
        }

        $rejectionReasons = $this->getAiQuestionRejectionReasons($question);
        if (empty($rejectionReasons) && $this->isAiQuestionTooSimilarToBlockedQuestions($question, $blockedQuestions)) {
            $rejectionReasons[] = 'too_similar_to_blocked_question';
        }
        if (!empty($rejectionReasons)) {
            Log::info('AI review draft question rejected', [
                'reasons' => $rejectionReasons,
                'type' => $question['type'] ?? null,
                'content_preview' => mb_substr(trim((string) ($question['content'] ?? $question['question'] ?? '')), 0, 160),
            ]);
            continue;
        }

        $filtered[] = $question;

        if (count($filtered) >= $minLength) {
            break;
        }
    }

    return $filtered;
}

/**
 * Check whether an AI question repeats or too closely mirrors already used questions.
 */
private function isAiQuestionTooSimilarToBlockedQuestions(array $question, array $blockedQuestions): bool
{
    $content = $this->normalizeAiQuestionText((string) ($question['content'] ?? $question['question'] ?? ''));
    if ($content === '') {
        return false;
    }

    foreach ($blockedQuestions as $blockedQuestion) {
        $blocked = $this->normalizeAiQuestionText($blockedQuestion);
        if ($blocked === '') {
            continue;
        }

        if ($content === $blocked) {
            return true;
        }

        similar_text($content, $blocked, $percent);
        if ($percent >= 88.0) {
            return true;
        }
    }

    return false;
}

/**
 * Normalize AI question text for duplicate detection.
 */
private function normalizeAiQuestionText(string $text): string
{
    $text = mb_strtolower(trim($text));
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = preg_replace('/[^\p{L}\p{N}\s]+/u', '', $text);
    return trim((string) $text);
}

/**
 * Explain why an AI-generated draft question should be rejected.
 */
private function getAiQuestionRejectionReasons(array $question): array
{
    $reasons = [];

    $content = trim((string) ($question['content'] ?? $question['question'] ?? ''));
    if (mb_strlen($content) < 12) {
        $reasons[] = 'content_too_short';
    }

    $type = (string) ($question['type'] ?? 'multiple_choice');
    if (!in_array($type, ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'], true)) {
        $reasons[] = 'unsupported_type';
    }

    $answers = is_array($question['answers'] ?? null) ? $question['answers'] : [];

    if ($type === 'matching') {
        if (count($answers) < 3) {
            $reasons[] = 'not_enough_matching_pairs';
        }
        $lefts = [];
        $rights = [];
        foreach ($answers as $answer) {
            if (!is_array($answer)) {
                $reasons[] = 'invalid_matching_pair';
                continue;
            }
            $left = trim((string) ($answer['left'] ?? $answer['text'] ?? ''));
            $right = trim((string) ($answer['right'] ?? $answer['answer_text'] ?? ''));
            if (mb_strlen($left) < 3 || mb_strlen($right) < 3) {
                $reasons[] = 'matching_pair_too_short';
            }
            $leftNorm = $this->normalizeAiQuestionText($left);
            $rightNorm = $this->normalizeAiQuestionText($right);
            if ($leftNorm !== '' && in_array($leftNorm, $lefts, true)) {
                $reasons[] = 'duplicate_matching_left';
            }
            if ($rightNorm !== '' && in_array($rightNorm, $rights, true)) {
                $reasons[] = 'duplicate_matching_right';
            }
            if ($leftNorm !== '') {
                $lefts[] = $leftNorm;
            }
            if ($rightNorm !== '') {
                $rights[] = $rightNorm;
            }
        }
    } elseif ($type === 'ordering') {
        if (count($answers) < 3) {
            $reasons[] = 'not_enough_ordering_items';
        }
        $items = [];
        foreach ($answers as $answer) {
            $text = trim((string) (is_array($answer) ? ($answer['text'] ?? $answer['answer_text'] ?? '') : $answer));
            if (mb_strlen($text) < 3) {
                $reasons[] = 'ordering_item_too_short';
            }
            $normalized = $this->normalizeAiQuestionText($text);
            if ($normalized !== '' && in_array($normalized, $items, true)) {
                $reasons[] = 'duplicate_ordering_item';
            }
            if ($normalized !== '') {
                $items[] = $normalized;
            }
        }
    } else {
    if (in_array($type, ['multiple_choice', 'single_choice'], true) && count($answers) < 4) {
        $reasons[] = 'not_enough_answers_for_choice_question';
    }
    if ($type === 'true_false' && count($answers) < 2) {
        $reasons[] = 'not_enough_answers_for_true_false';
    }

    $correctCount = 0;
    foreach ($answers as $answer) {
        if (is_array($answer) && !empty($answer['is_correct'])) {
            $correctCount++;
        }
    }

    if ($correctCount !== 1) {
        $reasons[] = 'invalid_correct_answer_count';
    }

    // Deeper answer-coherence checks (only meaningful for choice questions).
    if (in_array($type, ['multiple_choice', 'single_choice'], true) && count($answers) >= 2) {
        $texts = [];
        $normalizedTexts = [];
        $correctText = null;
        $distractorLengths = [];
        $hasPlaceholder = false;
        $hasForbiddenCombo = false;

        foreach ($answers as $answer) {
            $text = is_array($answer) ? trim((string) ($answer['text'] ?? '')) : trim((string) $answer);
            $isCorrect = is_array($answer) && !empty($answer['is_correct']);

            if ($text === '') {
                $reasons[] = 'empty_answer_option';
                continue;
            }

            $texts[] = $text;
            $normalizedTexts[] = $this->normalizeAiQuestionText($text);

            if ($this->isPlaceholderAnswer($text)) {
                $hasPlaceholder = true;
            }
            if (preg_match('/\b(toate|niciun(?:a|ul)?|none of the above|all of the above|ambele|cele de mai sus)\b/iu', $text)) {
                $hasForbiddenCombo = true;
            }

            if ($isCorrect) {
                $correctText = $text;
            } else {
                $distractorLengths[] = mb_strlen($text);
            }
        }

        // Duplicate / near-duplicate options make the question illogical.
        $uniqueNormalized = array_values(array_filter(array_unique($normalizedTexts)));
        if (count($uniqueNormalized) < count($normalizedTexts)) {
            $reasons[] = 'duplicate_answer_options';
        }

        if ($hasPlaceholder) {
            $reasons[] = 'placeholder_answer_option';
        }
        if ($hasForbiddenCombo) {
            $reasons[] = 'forbidden_answer_phrasing';
        }

        // Length-outlier giveaway: a correct answer far longer than every
        // distractor is a dead giveaway and signals an incoherent option set.
        if ($correctText !== null && !empty($distractorLengths)) {
            $correctLength = mb_strlen($correctText);
            $maxDistractor = max($distractorLengths);
            if ($maxDistractor >= 3 && $correctLength > ($maxDistractor * 2.6)) {
                $reasons[] = 'correct_answer_length_giveaway';
            }
        }
    }
    }

    if ($this->isMetaCourseQuestion($content)) {
        $reasons[] = 'meta_course_question';
    }

    return array_values(array_unique($reasons));
}

/**
 * Detect generic / placeholder answer options that signal low-quality questions.
 */
private function isPlaceholderAnswer(string $text): bool
{
    $normalized = $this->normalizeAiQuestionText($text);
    if ($normalized === '') {
        return true;
    }

    $placeholders = [
        'un concept fara legatura',
        'un alt subiect din alt curs',
        'un raspuns ales la intamplare',
        'un raspuns la intamplare',
        'alt raspuns',
        'raspuns gresit',
        'raspuns corect',
        'optiunea 1',
        'optiunea 2',
        'optiunea 3',
        'optiunea 4',
        'varianta 1',
        'varianta 2',
        'nu stiu',
        'niciun raspuns',
    ];

    foreach ($placeholders as $placeholder) {
        if ($normalized === $this->normalizeAiQuestionText($placeholder)) {
            return true;
        }
    }

    return false;
}

private function isMetaCourseQuestion(string $content): bool
{
    $normalized = $this->normalizeAiQuestionText($content);
    if ($normalized === '') {
        return false;
    }

    $metaPatterns = [
        'acest curs',
        'acestui curs',
        'subiectul principal',
        'concept este prezentat in principal',
        'concept este prezentat în principal',
        'continutul acestui curs',
        'conținutul acestui curs',
        'descriere se potriveste',
        'descriere se potrivește',
        'acest material',
        'acestui material',
        'cate lectii',
        'câte lecții',
        'cate module',
        'câte module',
        'ordinea lectiilor',
        'ordinea lecțiilor',
    ];

    foreach ($metaPatterns as $pattern) {
        if (str_contains($normalized, $this->normalizeAiQuestionText($pattern))) {
            return true;
        }
    }

    return false;
}

/**
 * Build a simplified fallback prompt when the first AI attempt fails quality checks.
 */
private function buildFallbackReviewPrompt(string $courseContent, string $difficulty, string $typeHint): string
{
    return AiPromptService::buildFallbackReviewPrompt($courseContent, $difficulty, $typeHint);
}
/**
 * Build a deterministic valid fallback question so the flow never returns empty.
 */
private function buildDeterministicFallbackReviewQuestion(string $courseContent, string $difficulty, int $variantIndex = 0): array
{
    $fact = $this->extractFallbackFact($courseContent, $variantIndex);
    $questionPrompts = [
        'Care afirmație este susținută de materialul de studiu?',
        'Ce afirmație reflectă corect informațiile din lecție?',
        'Care dintre următoarele enunțuri este corect conform textului?',
        'Ce idee este prezentată corect în conținutul lecției?',
    ];

    return [
        'content' => $questionPrompts[$variantIndex % count($questionPrompts)],
        'type' => 'multiple_choice',
        'answers' => [
            ['text' => $fact, 'is_correct' => true],
            ['text' => 'Materialul indică faptul că aceste concepte nu au impact practic.', 'is_correct' => false],
            ['text' => 'Materialul afirmă că toate tehnologiile prezentate au aceleași caracteristici.', 'is_correct' => false],
            ['text' => 'Materialul susține că performanța nu depinde de condițiile de utilizare.', 'is_correct' => false],
        ],
        'points' => 1,
        'explanation' => 'Răspunsul corect reproduce o afirmație concretă din materialul de studiu.',
        'difficulty' => in_array($difficulty, ['easy', 'medium', 'hard'], true) ? $difficulty : 'medium',
    ];
}

/**
 * Pick a deterministic fallback question that avoids already used/rejected duplicates.
 */
private function buildUniqueDeterministicFallbackReviewQuestion(
    string $courseContent,
    string $difficulty,
    array $usedQuestions = []
): array {
    $usedQuestions = array_values(array_filter(array_map('strval', $usedQuestions)));
    $startIndex = count($usedQuestions);
    $variantsCount = count($this->extractFallbackFacts($courseContent));

    for ($offset = 0; $offset < $variantsCount; $offset++) {
        $candidate = $this->buildDeterministicFallbackReviewQuestion(
            $courseContent,
            $difficulty,
            $startIndex + $offset
        );

        if (!$this->isAiQuestionTooSimilarToBlockedQuestions($candidate, $usedQuestions)) {
            return $candidate;
        }
    }

    return $this->buildDeterministicFallbackReviewQuestion($courseContent, $difficulty, $startIndex);
}

private function extractFallbackFact(string $courseContent, int $variantIndex = 0): string
{
    $facts = $this->extractFallbackFacts($courseContent);

    return $facts[$variantIndex % count($facts)];
}

/**
 * Extract concrete sentences from the study material for deterministic fallbacks.
 */
private function extractFallbackFacts(string $courseContent): array
{
    $material = $courseContent;
    $marker = '=== MATERIAL DE STUDIU';
    $markerPosition = mb_strpos($material, $marker);
    if ($markerPosition !== false) {
        $afterMarker = mb_substr($material, $markerPosition);
        $lineBreakPosition = mb_strpos($afterMarker, "\n");
        if ($lineBreakPosition !== false) {
            $material = mb_substr($afterMarker, $lineBreakPosition + 1);
        }
    }

    $material = preg_replace('/^#+\s+.+$/mu', '', $material) ?? $material;
    $material = $this->normalizeExtractedText(strip_tags($material));
    $sentences = preg_split('/(?<=[.!?])\s+/u', $material) ?: [];

    $facts = [];
    foreach ($sentences as $sentence) {
        $sentence = trim($sentence);
        $sentence = preg_replace('/\s+/u', ' ', $sentence) ?? $sentence;
        $length = mb_strlen($sentence);
        if ($length < 45 || $length > 220) {
            continue;
        }
        if ($this->isMetaCourseQuestion($sentence)) {
            continue;
        }
        if (preg_match('/\b(curs|lectie|lecție|modul|material de studiu)\b/iu', $sentence)) {
            continue;
        }

        $normalized = $this->normalizeAiQuestionText($sentence);
        if ($normalized !== '' && !isset($facts[$normalized])) {
            $facts[$normalized] = rtrim($sentence, '.!?') . '.';
        }
    }

    $facts = array_values($facts);
    if (!empty($facts)) {
        return $facts;
    }

    return ['Materialul prezintă concepte concrete care trebuie verificate direct din conținutul lecțiilor.'];
}

/**
 * Call AI API to generate questions (with optional fallback models)
 */
private function callAI(string $prompt, int $maxTokens = 1200, float $temperature = 0.2): string
{
    $temperature = max(0.0, min(1.2, $temperature));
    // Use HTTP client to call AI API
    $provider = (string) config('ai.provider', 'groq');
    if ($provider === 'groq') {
        $apiKey = (string) config('ai.groq.api_key', '');
        $apiUrl = (string) config('ai.groq.api_url', 'https://api.groq.com/openai/v1');
        $model = (string) (config('ai.groq.creator_quality_model')
            ?: config('ai.groq.creator_model')
            ?: config('ai.groq.model', 'llama-3.1-8b-instant'));
    } else {
        $apiKey = (string) config('ai.openai.api_key', '');
        $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
        $model = (string) (config('ai.openai.creator_quality_model')
            ?: config('ai.openai.creator_model')
            ?: config('ai.openai.model', 'gpt-4o-mini'));
    }

    $requiresApiKey = true;
    if ($requiresApiKey && !$apiKey) {
        $openaiKey = (string) config('ai.openai.api_key', '');
        if ($provider === 'groq' && $openaiKey !== '') {
            Log::info('GROQ key missing; falling back to OpenAI provider for this request');
            $provider = 'openai';
            $apiKey = $openaiKey;
            $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
            $model = (string) config('ai.openai.model', 'gpt-4o-mini');
        } else {
            throw new \Exception('AI API key not configured for provider: ' . $provider);
        }
    }

    $verify = (bool) config('ai.verify_ssl', true);

    // Helper to perform a request with a specific model
    $attemptRequest = function(string $modelToUse) use ($apiUrl, $apiKey, $prompt, $verify, $maxTokens, $temperature) {
        $headers = [
            'Content-Type' => 'application/json',
        ];
        if (!empty($apiKey)) {
            $headers['Authorization'] = "Bearer {$apiKey}";
        }

        return \Illuminate\Support\Facades\Http::withHeaders($headers)->withOptions([
            'verify' => $verify,
        ])->timeout(120)->post("{$apiUrl}/chat/completions", [
            'model' => $modelToUse,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => AiPromptService::buildQuestionSystemPrompt()
                ],
                [
                    'role' => 'user',
                    'content' => $prompt
                ]
            ],
            'temperature' => $temperature,
            'max_tokens' => max(256, min(4000, $maxTokens)),
            'response_format' => ['type' => 'json_object'],
        ]);
    };

    // Never block the request (and the single-threaded dev server) for long.
    // Groq returns very large retry delays when the DAILY quota is exhausted
    // (tens of minutes); in that case we must NOT sleep — switch model instead.
    $maxBackoffSeconds = 12;

    // First attempt with configured model
    $response = $attemptRequest($model);

    if ($response->status() === 429) {
        $retryDelay = $this->extractRetryDelaySeconds($response->body(), $response->header('Retry-After'));
        if ($retryDelay > 0 && $retryDelay <= $maxBackoffSeconds) {
            Log::warning('AI rate limited; short backoff then retry', [
                'provider' => $provider,
                'model' => $model,
                'retry_delay_seconds' => $retryDelay,
            ]);
            usleep(($retryDelay + 1) * 1000000);
            $response = $attemptRequest($model);
        } elseif ($retryDelay > $maxBackoffSeconds) {
            Log::warning('AI rate limited with long retry delay; switching to fallback model instead of sleeping', [
                'provider' => $provider,
                'model' => $model,
                'retry_delay_seconds' => $retryDelay,
            ]);
        }
    }

    // If initial attempt failed, try fallbacks (model errors OR rate limits)
    if (!$response->successful()) {
        $body = $response->body();
        $providerMessage = null;
        $providerCode = null;

        try {
            $json = $response->json();
            if (isset($json['error']['message'])) {
                $providerMessage = $json['error']['message'];
            } elseif (isset($json['error'])) {
                $providerMessage = is_string($json['error']) ? $json['error'] : json_encode($json['error']);
            }

            if (isset($json['error']['code'])) {
                $providerCode = $json['error']['code'];
            }
        } catch (\Throwable $e) {
            // ignore JSON parsing errors
        }

        // Determine if we should try fallback models (rate limit / model not found / 404 / explicit error code)
        $shouldTryFallback = ($response->status() === 404)
            || ($response->status() === 429)
            || str_contains(strtolower($providerMessage ?? ''), 'model')
            || $providerCode === 'model_not_found';

        if ($shouldTryFallback) {
            $fallbackEnv = $provider === 'groq'
                ? (string) config('ai.groq.fallback_models', '')
                : (string) config('ai.openai.fallback_models', '');
            $fallbacks = array_filter(array_map('trim', explode(',', (string)$fallbackEnv)));

            foreach ($fallbacks as $fallbackModel) {
                if (empty($fallbackModel)) continue;
                Log::info('Trying fallback AI model', ['provider' => $provider, 'model' => $fallbackModel]);

                $resp2 = $attemptRequest($fallbackModel);
                if ($resp2->successful()) {
                    $response = $resp2;
                    $model = $fallbackModel;
                    break;
                }

                Log::warning('Fallback model attempt failed', ['model' => $fallbackModel, 'status' => $resp2->status(), 'body' => $resp2->body()]);
            }
        }

        // If still not successful, surface provider message (if any)
        if (!$response->successful()) {
            try {
                $json = $response->json();
                if (isset($json['error']['message'])) {
                    $providerMessage = $json['error']['message'];
                } elseif (isset($json['error'])) {
                    $providerMessage = is_string($json['error']) ? $json['error'] : json_encode($json['error']);
                }
            } catch (\Throwable $e) {
                // ignore
            }

            Log::error('AI API Error', [
                'status' => $response->status(),
                'error' => $response->body(),
                'provider_message' => $providerMessage
            ]);

            $message = 'AI API error: ' . $response->status();
            if ($providerMessage) {
                $message .= ' - ' . $providerMessage;
            }

            throw new \Exception($message);
        }
    }

    $data = $response->json();

    // Log which model succeeded for easier debugging
    try {
        Log::info('AI call successful', [
            'provider' => $provider,
            'model' => $model,
            'status' => $response->status(),
        ]);
    } catch (\Throwable $e) {
        // Ignore logging errors
    }

    return $data['choices'][0]['message']['content'] ?? '';
}

/**
 * Extract retry delay seconds from a provider rate-limit response.
 */
private function extractRetryDelaySeconds(string $body, $retryAfterHeader = null): int
{
    if (is_numeric($retryAfterHeader)) {
        return max(1, (int) ceil((float) $retryAfterHeader));
    }

    if (preg_match('/try again in\s+([0-9]+(?:\.[0-9]+)?)s/i', $body, $matches)) {
        return max(1, (int) ceil((float) $matches[1]));
    }

    return 0;
}

/**
 * Parse AI response to extract questions
 */
private function parseAIResponse(string $response): array
{
    $candidates = [];
    $trimmed = trim($response);
    if ($trimmed !== '') {
        $candidates[] = $trimmed;
    }

    if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/i', $response, $matches)) {
        $candidates[] = trim($matches[1]);
    }

    $firstBrace = strpos($response, '{');
    $lastBrace = strrpos($response, '}');
    if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
        $candidates[] = trim(substr($response, $firstBrace, $lastBrace - $firstBrace + 1));
    }

    foreach ($candidates as $candidate) {
        $data = json_decode($candidate, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
            continue;
        }

        if (isset($data['questions']) && is_array($data['questions'])) {
            return $data['questions'];
        }

        if (isset($data['content']) || isset($data['question'])) {
            return [$data];
        }

        if (array_is_list($data)) {
            return $data;
        }
    }

    Log::warning('Could not parse AI response', [
        'response_preview' => substr($response, 0, 500)
    ]);

    return [];
}

/**
 * Format questions for database storage
 */
private function formatQuestionsForDatabase(array $questions): array
{
    $formatted = [];
    
    foreach ($questions as $index => $question) {
        $answers = [];
        $qType = (string) ($question['type'] ?? 'multiple_choice');
        if (!in_array($qType, ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'], true)) {
            $qType = 'multiple_choice';
        }
        
        // Handle different answer formats
        if (isset($question['answers']) && is_array($question['answers'])) {
            foreach ($question['answers'] as $idx => $answer) {
                if (!is_array($answer)) {
                    if ($qType === 'ordering') {
                        $answers[] = [
                            'text' => (string) $answer,
                            'is_correct' => true,
                            'order' => $idx,
                        ];
                    }
                    continue;
                }

                if ($qType === 'matching') {
                    $left = trim((string) ($answer['left'] ?? $answer['text'] ?? ''));
                    $right = trim((string) ($answer['right'] ?? $answer['answer_text'] ?? ''));
                    $answers[] = [
                        'left' => $left,
                        'right' => $right,
                        'text' => $left,
                        'answer_text' => $right,
                        'is_correct' => true,
                        'order' => $idx,
                    ];
                    continue;
                }

                if ($qType === 'ordering') {
                    $text = trim((string) ($answer['text'] ?? $answer['answer_text'] ?? $answer['content'] ?? ''));
                    $answers[] = [
                        'text' => $text,
                        'is_correct' => true,
                        'order' => $idx,
                    ];
                    continue;
                }

                $answers[] = [
                    'text' => $answer['text'] ?? $answer,
                    'is_correct' => $answer['is_correct'] ?? false,
                    'order' => $idx,
                ];
            }
        }

        // Ensure at least one correct answer for choice questions
        if (!empty($answers) && in_array($qType, ['multiple_choice', 'single_choice', 'true_false'], true)) {
            $hasCorrect = false;
            foreach ($answers as $answer) {
                if (($answer['is_correct'] ?? false) === true) {
                    $hasCorrect = true;
                    break;
                }
            }
            if (!$hasCorrect) {
                $answers[0]['is_correct'] = true;
            }
        }

        if ($qType === 'true_false' && count($answers) < 2) {
            $answers = [
                ['text' => 'Adevărat', 'is_correct' => true],
                ['text' => 'Fals', 'is_correct' => false],
            ];
        }

        $answers = $this->testBuilderService->normalizeQuestionAnswersForType($qType, $answers);

        $difficulty = (string) ($question['difficulty'] ?? 'medium');
        if (!in_array($difficulty, ['easy', 'medium', 'hard'], true)) {
            $difficulty = 'medium';
        }
        $cognitiveLevel = (string) ($question['cognitive_level'] ?? '');
        if (!in_array($cognitiveLevel, ['recall', 'understanding', 'application', 'analysis'], true)) {
            $cognitiveLevel = null;
        }

        $metadata = [
            'difficulty' => $difficulty,
            'source' => 'ai_draft',
        ];
        if ($cognitiveLevel !== null) {
            $metadata['cognitive_level'] = $cognitiveLevel;
        }

        $formatted[] = [
            'type' => $qType,
            'content' => $question['content'] ?? $question['question'] ?? 'Întrebare generată',
            'answers' => $answers,
            'points' => $question['points'] ?? 1,
            'order' => $index,
            'explanation' => $question['explanation'] ?? null,
            'metadata' => $metadata,
        ];
    }

    return $formatted;
}
}
