<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\QuestionBank;
use App\Models\Question;
use App\Models\Tag;
use App\Models\Course;
use App\Models\Test;
use App\Services\TestBuilderService;
use App\Services\AiPromptService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * QuestionBankAdminController
 * 
 * Handles question bank creation and management
 * Question banks allow reusable question sets across multiple tests
 */
class QuestionBankAdminController extends Controller
{
    protected TestBuilderService $testBuilderService;

    public function __construct(TestBuilderService $testBuilderService)
    {
        $this->testBuilderService = $testBuilderService;
    }

    /**
     * List all question banks
     */
    public function index(Request $request)
    {
        $query = QuestionBank::with(['creator', 'questions', 'tags'])
            ->withCount(['questions', 'tests', 'starredQuestions as starred_questions_count']);
        if (auth()->user()->isInstructor()) {
            $query->where('created_by', auth()->id());
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by creator
        if ($request->has('created_by')) {
            $query->where('created_by', $request->created_by);
        }

        // Search
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        // Filter by question metadata.language (question-level)
        if ($request->filled('language')) {
            $language = trim((string) $request->language);
            $query->whereHas('questions', function ($q) use ($language) {
                $q->where('metadata->language', $language);
            });
        }

        // Filter by question metadata.difficulty (question-level)
        if ($request->filled('difficulty')) {
            $difficulty = trim((string) $request->difficulty);
            $query->whereHas('questions', function ($q) use ($difficulty) {
                $q->where('metadata->difficulty', $difficulty);
            });
        }

        // Filter by tag presence in question metadata.tags[]
        if ($request->filled('tag')) {
            $tag = trim((string) $request->tag);
            $query->whereHas('questions', function ($q) use ($tag) {
                $q->whereJsonContains('metadata->tags', $tag);
            });
        }

        if ($request->filled('folder_tag')) {
            $folderTag = trim((string) $request->folder_tag);
            $query->whereHas('tags', function ($q) use ($folderTag) {
                $q->where('slug', Str::slug($folderTag))
                    ->orWhere('name', $folderTag);
            });
        }

        $banks = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json($banks);
    }

    /**
     * Show question bank details
     */
    public function show($id)
    {
        $bank = QuestionBank::with(['creator', 'questions', 'tests', 'tags'])
            ->withCount(['questions', 'tests', 'starredQuestions as starred_questions_count'])
            ->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți accesa doar băncile tale de întrebări.');
        }
        return response()->json($bank);
    }

    /**
     * Create a new question bank
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:draft,published',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
            'questions' => 'nullable|array',
            'questions.*.type' => 'required|string|in:multiple_choice,single_choice,true_false,matching,ordering',
            'questions.*.content' => 'required|string',
            'questions.*.answers' => 'required|array',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.explanation' => 'nullable|string',
        ]);

        $creator = Auth::user();
        $bank = $this->testBuilderService->createQuestionBank($validated, $creator);
        $this->syncFolderTags($bank, $validated['tags'] ?? []);

        return response()->json([
            'message' => 'Question bank created successfully',
            'bank' => $bank->load(['questions', 'creator', 'tags']),
        ], 201);
    }

    /**
     * Update a question bank
     */
    public function update(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'status' => 'nullable|in:draft,published',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
        ]);

        $updateData = $validated;
        unset($updateData['tags']);
        $bank->update($updateData);
        if (array_key_exists('tags', $validated)) {
            $this->syncFolderTags($bank, $validated['tags'] ?? []);
        }

        return response()->json([
            'message' => 'Question bank updated successfully',
            'bank' => $bank->load(['questions', 'creator', 'tags']),
        ]);
    }

    /**
     * Delete a question bank
     */
    public function destroy($id)
    {
        $bank = QuestionBank::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        // Check if bank is used in any tests
        if ($bank->tests()->count() > 0) {
            return response()->json([
                'error' => 'Cannot delete question bank that is used in tests',
            ], 422);
        }

        $bank->delete();

        return response()->json([
            'message' => 'Question bank deleted successfully',
        ]);
    }

    /**
     * Add questions to bank
     */
    public function addQuestions(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'questions' => 'required|array',
            'questions.*.type' => 'required|string|in:multiple_choice,single_choice,true_false,matching,ordering',
            'questions.*.content' => 'required|string',
            'questions.*.answers' => 'required|array',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.explanation' => 'nullable|string',
        ]);

        $this->testBuilderService->addQuestionsToBank($bank, $validated['questions']);

        return response()->json([
            'message' => 'Questions added successfully',
            'bank' => $bank->load('questions'),
        ]);
    }

    /**
     * Get questions from a question bank
     */
    public function getQuestions($id)
    {
        $bank = QuestionBank::with('questions')->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        return response()->json($bank->questions);
    }

    protected function syncFolderTags(QuestionBank $bank, array $tags): void
    {
        $normalized = collect($tags)
            ->map(fn ($t) => trim((string) $t))
            ->filter()
            ->unique()
            ->values();

        $tagIds = $normalized->map(function (string $name) {
            $slug = Str::slug($name);
            $tag = Tag::firstOrCreate(
                ['slug' => $slug],
                ['name' => $name]
            );
            return $tag->id;
        })->all();

        $bank->tags()->sync($tagIds);
    }

    /**
     * Add a single question to bank
     */
    public function addQuestion(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);

        $validated = $request->validate([
            'type' => 'required|string|in:multiple_choice,single_choice,true_false,matching,ordering',
            'content' => 'required|string',
            'answers' => 'required|array',
            'points' => 'nullable|integer|min:1',
            'order' => 'nullable|integer|min:0',
            'explanation' => 'nullable|string',
            'metadata' => 'nullable|array',
        ]);

        $this->testBuilderService->addQuestionsToBank($bank, [$validated]);

        return response()->json([
            'message' => 'Question added successfully',
            'bank' => $bank->load('questions'),
        ]);
    }

    /**
     * Update a question in bank
     */
    public function updateQuestion(Request $request, $id, $questionId)
    {
        $bank = QuestionBank::findOrFail($id);
        $question = Question::where('question_bank_id', $bank->id)
            ->findOrFail($questionId);

        $validated = $request->validate([
            'type' => 'sometimes|required|string|in:multiple_choice,single_choice,true_false,matching,ordering',
            'content' => 'sometimes|required|string',
            'answers' => 'sometimes|required|array',
            'points' => 'nullable|integer|min:1',
            'order' => 'nullable|integer|min:0',
            'explanation' => 'nullable|string',
            'metadata' => 'nullable|array',
        ]);

        $question->update($validated);

        return response()->json([
            'message' => 'Question updated successfully',
            'question' => $question->fresh(),
        ]);
    }

    /**
     * Remove a question from bank
     */
    public function removeQuestion($id, $questionId)
    {
        $bank = QuestionBank::findOrFail($id);
        $question = Question::where('question_bank_id', $bank->id)
            ->findOrFail($questionId);

        $usageCount = Test::query()
            ->where('question_source', 'bank')
            ->where('question_set_id', (int) $bank->id)
            ->count();
        if ($usageCount > 0) {
            return response()->json([
                'error' => 'Întrebarea nu poate fi ștearsă deoarece această bancă este folosită în teste active.',
                'usage_count' => $usageCount,
            ], 422);
        }

        $question->delete();

        return response()->json([
            'message' => 'Question removed successfully',
        ]);
    }

    /**
     * Reorder questions inside a question bank.
     */
    public function reorderQuestions(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);

        $validated = $request->validate([
            'question_ids' => 'required|array|min:1',
            'question_ids.*' => 'integer',
        ]);

        $ids = array_values(array_unique($validated['question_ids']));
        $count = Question::where('question_bank_id', $bank->id)->whereIn('id', $ids)->count();
        if ($count !== count($ids)) {
            return response()->json([
                'error' => 'Invalid question_ids: some questions do not belong to this question bank.',
            ], 422);
        }

        DB::transaction(function () use ($bank, $ids) {
            foreach ($ids as $index => $qid) {
                Question::where('question_bank_id', $bank->id)->where('id', $qid)->update(['order' => $index]);
            }
        });

        return response()->json([
            'message' => 'Questions reordered successfully',
            'questions' => Question::where('question_bank_id', $bank->id)->orderBy('order')->get(),
        ]);
    }

    /**
     * Generate questions from course content using AI
     */
    public function generateFromCourse(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);
        
        $validated = $request->validate([
            'course_id' => 'required|integer|exists:courses,id',
            'numberOfQuestions' => 'nullable|integer|min:1|max:50',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'questionTypes' => 'nullable|array',
        ]);

        $course = Course::with(['modules.lessons'])->findOrFail($validated['course_id']);
        
        // Extract course content
        $courseContent = $this->extractCourseContent($course);
        
        // Generate questions using AI
        try {
            $questions = $this->generateQuestionsWithAI(
                $courseContent,
                $validated['numberOfQuestions'] ?? 10,
                $validated['difficulty'] ?? 'medium',
                is_array($validated['questionTypes'] ?? null) ? $validated['questionTypes'] : ['multiple_choice']
            );
        } catch (\Exception $e) {
            // Surface helpful error messages for devs while keeping the response safe
            Log::error('Error generating questions (endpoint)', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'error' => 'Eroare la generarea întrebărilor: ' . ($e->getMessage() ?: 'Problema AI'),
            ], 500);
        }

        if (empty($questions)) {
            return response()->json([
                'error' => 'Nu s-au putut genera întrebări. Te rugăm să încerci din nou.',
            ], 500);
        }

        // Add questions to bank
        $this->testBuilderService->addQuestionsToBank($bank, $questions);

        return response()->json([
            'message' => 'Questions generated successfully',
            'questions_generated' => count($questions),
            'bank' => $bank->load('questions'),
        ]);
    }

    /**
     * Generate questions from custom text content
     */
    public function generateFromText(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);
        
        $validated = $request->validate([
            'content' => 'required|string|min:10|max:10000',
            'numberOfQuestions' => 'nullable|integer|min:1|max:50',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'questionTypes' => 'nullable|array',
        ]);

        // Generate questions using AI with custom content
        try {
            $questions = $this->generateQuestionsWithAI(
                $validated['content'],
                $validated['numberOfQuestions'] ?? 10,
                $validated['difficulty'] ?? 'medium',
                is_array($validated['questionTypes'] ?? null) ? $validated['questionTypes'] : ['multiple_choice']
            );
        } catch (\Exception $e) {
            Log::error('Error generating questions from text', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'error' => 'Eroare la generarea întrebărilor: ' . ($e->getMessage() ?: 'Problema AI'),
            ], 500);
        }

        if (empty($questions)) {
            return response()->json([
                'error' => 'Nu s-au putut genera întrebări. Te rugăm să încerci din nou.',
            ], 500);
        }

        // Add questions to bank
        $this->testBuilderService->addQuestionsToBank($bank, $questions);

        return response()->json([
            'message' => 'Questions generated successfully',
            'questions_generated' => count($questions),
            'bank' => $bank->load('questions'),
        ]);
    }

    /**
     * Generate AI questions in preview mode (no DB write).
     */
    public function previewAiQuestions(Request $request, $id)
    {
        $bank = QuestionBank::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $bank->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'topic' => 'nullable|string|min:2|max:300',
            'content' => 'nullable|string|min:10|max:10000',
            'course_id' => 'nullable|integer|exists:courses,id',
            'numberOfQuestions' => 'nullable|integer|min:1|max:50',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'questionTypes' => 'nullable|array',
            'instructions' => 'nullable|string|max:4000',
            'approvedQuestions' => 'nullable|array',
            'approvedQuestions.*' => 'string',
            'blockedQuestions' => 'nullable|array',
            'blockedQuestions.*' => 'string',
        ]);

        $topic = trim((string) ($validated['topic'] ?? ''));
        $content = trim((string) ($validated['content'] ?? ''));
        $courseId = isset($validated['course_id']) ? (int) $validated['course_id'] : null;
        if ($topic === '' && $content === '' && !$courseId) {
            return response()->json([
                'error' => 'Topic, content sau course_id este obligatoriu.',
            ], 422);
        }

        $seedContent = $content !== '' ? $content : "Topic: {$topic}";
        if ($courseId) {
            $course = Course::with(['modules.lessons'])->findOrFail($courseId);
            $seedContent = $this->extractCourseContent($course);
        }

        $instructions = trim((string) ($validated['instructions'] ?? ''));
        $approvedQuestions = array_values(array_filter(array_map('strval', (array) ($validated['approvedQuestions'] ?? []))));
        $blockedQuestions = array_values(array_filter(array_map('strval', (array) ($validated['blockedQuestions'] ?? []))));
        $autoGenerate = filter_var($request->input('autoGenerate', false), FILTER_VALIDATE_BOOLEAN);
        try {
            if ($autoGenerate) {
                $questions = $this->generateAutoQuestionsSequentially(
                    $seedContent,
                    max(1, (int) ($validated['numberOfQuestions'] ?? 1)),
                    $validated['difficulty'] ?? 'medium',
                    is_array($validated['questionTypes'] ?? null) ? $validated['questionTypes'] : ['multiple_choice']
                );
            } else {
                $questions = $this->generateReviewDraftQuestionWithAI(
                    $seedContent,
                    $validated['difficulty'] ?? 'medium',
                    is_array($validated['questionTypes'] ?? null) ? $validated['questionTypes'] : ['multiple_choice'],
                    $instructions,
                    $approvedQuestions,
                    $blockedQuestions
                );
            }
        } catch (\Exception $e) {
            Log::error('Error generating AI preview questions', [
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'error' => 'Eroare la generarea draftului AI: ' . ($e->getMessage() ?: 'Problema AI'),
            ], 500);
        }

        return response()->json([
            'message' => 'Draft generated successfully',
            'draft' => $questions,
        ]);
    }

    /**
     * Extract course content for AI processing
     */
    private function extractCourseContent(Course $course): string
    {
        $content = "Curs: {$course->title}\n";
        $content .= "Descriere: {$course->description}\n\n";

        foreach ($course->modules as $module) {
            $content .= "Modul: {$module->title}\n";
            if ($module->description) {
                $content .= "Descriere modul: {$module->description}\n";
            }
            $content .= "Lecții:\n";

            foreach ($module->lessons as $lesson) {
                $content .= "- {$lesson->title}\n";
                if ($lesson->content) {
                    // Strip HTML tags and get text content
                    $textContent = strip_tags($lesson->content);
                    $textContent = preg_replace('/\s+/', ' ', $textContent);
                    $textContent = trim($textContent);
                    // Limit content length to avoid token limits
                    $textContent = mb_substr($textContent, 0, 400);
                    $content .= "  Conținut: {$textContent}\n";
                }
            }
            $content .= "\n";
        }

        return $this->compactCourseContentForQuestions($content);
    }

    /**
     * Compact course content so question-generation prompts stay under model limits.
     */
    private function compactCourseContentForQuestions(string $courseContent, int $maxChars = 5000): string
    {
        $courseContent = trim($courseContent);
        if ($courseContent === '' || mb_strlen($courseContent) <= $maxChars) {
            return $courseContent;
        }

        return rtrim(mb_substr($courseContent, 0, max(0, $maxChars - 80))) . "\n[continut suplimentar omis]";
    }

    /**
     * Generate questions using AI
     */
    private function generateQuestionsWithAI(string $courseContent, int $numberOfQuestions, string $difficulty, array $questionTypes = ['multiple_choice']): array
    {
        try {
            return $this->generateAutoQuestionsSequentially($courseContent, $numberOfQuestions, $difficulty, $questionTypes);
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
    private function generateAutoQuestionsSequentially(string $courseContent, int $numberOfQuestions, string $difficulty, array $questionTypes = ['multiple_choice']): array
    {
        $typeList = array_values(array_filter(array_map('strval', $questionTypes)));
        $typeList = array_values(array_intersect($typeList, ['multiple_choice', 'true_false']));
        if (empty($typeList)) {
            $typeList = ['multiple_choice', 'true_false'];
        }

        $generatedQuestions = [];
        $usedQuestionContents = [];
        $usedNormalizedContents = [];

        for ($index = 0; $index < $numberOfQuestions; $index++) {
            $draftQuestions = $this->generateReviewDraftQuestionWithAI(
                $courseContent,
                $difficulty,
                $typeList,
                '',
                $usedQuestionContents,
                $usedQuestionContents
            );

            $candidate = is_array($draftQuestions[0] ?? null) ? $draftQuestions[0] : null;
            $content = trim((string) ($candidate['content'] ?? $candidate['question'] ?? ''));
            $normalized = $this->normalizeAiQuestionText($content);

            if (!$candidate || $content === '' || ($normalized !== '' && in_array($normalized, $usedNormalizedContents, true))) {
                $fallbackQuestion = $this->buildDeterministicFallbackReviewQuestion($courseContent, $difficulty, $index);
                $fallbackFormatted = $this->formatQuestionsForDatabase([$fallbackQuestion]);
                $candidate = $fallbackFormatted[0] ?? null;
                $content = trim((string) ($candidate['content'] ?? ''));
                $normalized = $this->normalizeAiQuestionText($content);
            }

            if (!$candidate || $content === '') {
                Log::warning('Skipping empty AI auto-generated question candidate', [
                    'index' => $index,
                    'difficulty' => $difficulty,
                ]);
                continue;
            }

            $generatedQuestions[] = $candidate;
            $usedQuestionContents[] = $content;
            if ($normalized !== '') {
                $usedNormalizedContents[] = $normalized;
            }
        }

        if (empty($generatedQuestions)) {
            $fallbackQuestion = $this->buildDeterministicFallbackReviewQuestion($courseContent, $difficulty, 0);
            return $this->formatQuestionsForDatabase([$fallbackQuestion]);
        }

        return $generatedQuestions;
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
        array $blockedQuestions = []
    ): array {
        try {
            $courseContent = $this->compactCourseContentForQuestions($courseContent);
            $typeList = array_values(array_filter(array_map('strval', $questionTypes)));
            $typeList = array_values(array_intersect($typeList, ['multiple_choice', 'true_false']));
            if (empty($typeList)) {
                $typeList = ['multiple_choice', 'true_false'];
            }
            $typeHint = implode(', ', $typeList);
            $usedQuestions = array_values(array_filter(array_unique(array_merge($approvedQuestions, $blockedQuestions))));

            $prompt = $this->buildQuestionGenerationPrompt(
                $courseContent,
                $difficulty,
                $typeList,
                $usedQuestions,
                $extraInstructions
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
        string $extraInstructions = ''
    ): string {
        return AiPromptService::buildQuestionGenerationPrompt(
            $courseContent,
            $difficulty,
            $questionTypes,
            $usedQuestions,
            $extraInstructions
        );
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
        if (!in_array($type, ['multiple_choice', 'true_false'], true)) {
            $reasons[] = 'unsupported_type';
        }

        $answers = is_array($question['answers'] ?? null) ? $question['answers'] : [];
        if ($type === 'multiple_choice' && count($answers) < 4) {
            $reasons[] = 'not_enough_answers_for_multiple_choice';
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

        return $reasons;
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
        $topic = $this->extractFallbackTopic($courseContent);
        $variants = [
            [
                'content' => 'Care este subiectul principal al acestui curs?',
                'explanation' => 'Întrebarea verifică tema centrală a cursului.',
            ],
            [
                'content' => 'Ce concept este prezentat în principal în acest material?',
                'explanation' => 'Întrebarea verifică ideea principală din conținutul cursului.',
            ],
            [
                'content' => 'Care descriere se potrivește cel mai bine acestui curs?',
                'explanation' => 'Întrebarea verifică înțelegerea generală a cursului.',
            ],
            [
                'content' => 'Ce afirmă cel mai bine conținutul acestui curs?',
                'explanation' => 'Întrebarea verifică subiectul central al cursului.',
            ],
        ];
        $variant = $variants[$variantIndex % count($variants)];

        return [
            'content' => $variant['content'],
            'type' => 'multiple_choice',
            'answers' => [
                ['text' => $topic, 'is_correct' => true],
                ['text' => 'Un concept fara legatura', 'is_correct' => false],
                ['text' => 'Un alt subiect din alt curs', 'is_correct' => false],
                ['text' => 'Un raspuns ales la intamplare', 'is_correct' => false],
            ],
            'points' => 1,
            'explanation' => $variant['explanation'],
            'difficulty' => in_array($difficulty, ['easy', 'medium', 'hard'], true) ? $difficulty : 'medium',
            'tags' => ['ai_fallback'],
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
        $variantsCount = 4;

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

    /**
     * Extract a clean fallback topic from the course content.
     */
    private function extractFallbackTopic(string $courseContent): string
    {
        $lines = preg_split('/\R+/', trim($courseContent)) ?: [];

        foreach ($lines as $line) {
            $clean = trim((string) $line);
            if ($clean === '') {
                continue;
            }

            if (preg_match('/^Curs:\s*(.+)$/i', $clean, $matches)) {
                $topic = trim($matches[1]);
                if ($topic !== '') {
                    return $topic;
                }
            }
        }

        foreach ($lines as $line) {
            $clean = trim((string) $line);
            if ($clean === '') {
                continue;
            }
            if (preg_match('/^(Modul|Lectie|Lecție|Lesson):\s*(.+)$/i', $clean, $matches)) {
                $topic = trim($matches[2]);
                if ($topic !== '') {
                    return $topic;
                }
            }
        }

        foreach ($lines as $line) {
            $clean = trim((string) $line);
            if ($clean === '') {
                continue;
            }
            $clean = preg_replace('/^(Curs|Modul|Lectie|Lecție|Lesson):\s*/i', '', $clean);
            $clean = trim((string) $clean);
            if ($clean !== '' && mb_strlen($clean) >= 8) {
                return $clean;
            }
        }

        return 'tema principala a cursului';
    }

    /**
     * Call AI API to generate questions (with optional fallback models)
     */
    private function callAI(string $prompt, int $maxTokens = 1200): string
    {
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
        $attemptRequest = function(string $modelToUse) use ($apiUrl, $apiKey, $prompt, $verify, $maxTokens) {
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
                'temperature' => 0.2,
                'max_tokens' => max(256, min(4000, $maxTokens)),
                'response_format' => ['type' => 'json_object'],
            ]);
        };

        // First attempt with configured model
        $response = $attemptRequest($model);

        if ($response->status() === 429) {
            $retryDelay = $this->extractRetryDelaySeconds($response->body(), $response->header('Retry-After'));
            if ($retryDelay > 0) {
                Log::warning('AI rate limited; retrying after backoff', [
                    'provider' => $provider,
                    'model' => $model,
                    'retry_delay_seconds' => $retryDelay,
                ]);
                usleep(($retryDelay + 1) * 1000000);
                $response = $attemptRequest($model);
            }
        }

        // If initial attempt failed, try fallbacks (only for model errors)
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

            // Determine if we should try fallback models (model not found / 404 / explicit error code)
            $shouldTryFallback = ($response->status() === 404) || str_contains(strtolower($providerMessage ?? ''), 'model') || $providerCode === 'model_not_found';

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
                foreach ($question['answers'] as $answer) {
                    if (is_array($answer)) {
                        $answers[] = [
                            'text' => $answer['text'] ?? $answer,
                            'is_correct' => $answer['is_correct'] ?? false
                        ];
                    } else {
                        $answers[] = [
                            'text' => $answer,
                            'is_correct' => false
                        ];
                    }
                }
            }

            // Ensure at least one correct answer
            if (!empty($answers)) {
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

            $rawTags = is_array($question['tags'] ?? null) ? $question['tags'] : [];
            $tags = array_values(array_unique(array_filter(array_map(function ($tag) {
                return trim((string) $tag);
            }, $rawTags))));
            $difficulty = (string) ($question['difficulty'] ?? 'medium');
            if (!in_array($difficulty, ['easy', 'medium', 'hard'], true)) {
                $difficulty = 'medium';
            }

            $formatted[] = [
                'type' => $qType,
                'content' => $question['content'] ?? $question['question'] ?? 'Întrebare generată',
                'answers' => $answers,
                'points' => $question['points'] ?? 1,
                'order' => $index,
                'explanation' => $question['explanation'] ?? null,
                'metadata' => [
                    'difficulty' => $difficulty,
                    'tags' => $tags,
                    'source' => 'ai_draft',
                ],
            ];
        }

        return $formatted;
    }
}
