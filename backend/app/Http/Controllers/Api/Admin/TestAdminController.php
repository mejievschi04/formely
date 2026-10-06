<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Test;
use App\Models\Question;
use App\Models\TestResult;
use App\Models\ActivityLog;
use App\Services\TestBuilderService;
use App\Services\TestQuestionSelectionService;
use App\Services\TestAnalyticsService;
use App\Services\VoltQuestionGenerationService;
use App\Services\CourseBuilderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

/**
 * TestAdminController
 * 
 * Handles standalone test creation and management
 * Tests are created independently and can be linked to courses later
 */
class TestAdminController extends Controller
{
    protected TestBuilderService $testBuilderService;
    protected TestQuestionSelectionService $questionSelectionService;
    protected TestAnalyticsService $testAnalyticsService;
    protected VoltQuestionGenerationService $voltQuestionGeneration;
    protected CourseBuilderService $courseBuilderService;

    public function __construct(
        TestBuilderService $testBuilderService,
        TestQuestionSelectionService $questionSelectionService,
        TestAnalyticsService $testAnalyticsService,
        VoltQuestionGenerationService $voltQuestionGeneration,
        CourseBuilderService $courseBuilderService
    ) {
        $this->testBuilderService = $testBuilderService;
        $this->questionSelectionService = $questionSelectionService;
        $this->testAnalyticsService = $testAnalyticsService;
        $this->voltQuestionGeneration = $voltQuestionGeneration;
        $this->courseBuilderService = $courseBuilderService;
    }

    /**
     * List all tests
     */
    public function index(Request $request)
    {
        $query = Test::with(['creator', 'questionBank'])->withCount(['questions', 'results']);

        if (auth()->user()->isInstructor()) {
            $query->where('created_by', auth()->id());
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by type
        if ($request->has('type')) {
            $query->where('type', $request->type);
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

        $perPage = min(500, max(1, (int) $request->input('per_page', 20)));
        $tests = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($tests);
    }

    /**
     * Show test details
     */
    public function show($id)
    {
        $test = Test::with([
            'creator',
            'questions',
            'questionBank',
            'courses' => function($query) {
                $query->withPivot('scope', 'scope_id', 'required', 'passing_score');
            }
        ])->findOrFail($id);

        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți accesa doar testele tale.');
        }

        return response()->json($test);
    }

    /**
     * Create a new test
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|in:practice,graded,final',
            'status' => 'nullable|in:draft,published',
            'time_limit_minutes' => 'nullable|integer|min:1',
            'max_attempts' => 'nullable|integer|min:1',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'randomize_questions' => 'nullable|boolean',
            'randomize_answers' => 'nullable|boolean',
            'show_results_immediately' => 'nullable|boolean',
            'show_correct_answers' => 'nullable|boolean',
            'show_only_submitted_answers' => 'nullable|boolean',
            'allow_review' => 'nullable|boolean',
            'requires_manual_verification' => 'nullable|boolean',
            'question_source' => 'nullable|in:direct,bank',
            'question_set_id' => 'nullable',
            'question_selection' => 'nullable|array',
            'questions' => 'nullable|array',
            'questions.*.type' => 'required|string',
            'questions.*.content' => 'required|string',
            'questions.*.answers' => 'required|array',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.explanation' => 'nullable|string',
        ]);

        $creator = Auth::user();
        if (!$creator) {
            return response()->json(['message' => 'Trebuie să fii autentificat pentru a crea un test.'], 401);
        }

        // question_set_id: doar dacă e număr valid și există în question_banks
        if (isset($validated['question_set_id']) && ($validated['question_set_id'] === '' || $validated['question_set_id'] === null)) {
            $validated['question_set_id'] = null;
        } elseif (isset($validated['question_set_id']) && !\App\Models\QuestionBank::find($validated['question_set_id'])) {
            $validated['question_set_id'] = null;
        }

        try {
            $test = $this->testBuilderService->createTest($validated, $creator);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        ActivityLog::create([
            'user_id' => $creator->id,
            'action' => 'telemetry.admin_test_created',
            'model_type' => Test::class,
            'model_id' => $test->id,
            'description' => 'Telemetry event: admin_test_created',
            'new_values' => [
                'question_source' => $test->question_source,
                'has_question_selection' => !empty($test->question_selection),
                'created_at' => now()->toISOString(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Test created successfully',
            'test' => $test->load(['questions', 'creator']),
        ], 201);
    }

    /**
     * Update a test
     */
    public function update(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți edita doar testele tale.');
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|in:practice,graded,final',
            'status' => 'nullable|in:draft,published',
            'time_limit_minutes' => 'nullable|integer|min:1',
            'max_attempts' => 'nullable|integer|min:1',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'randomize_questions' => 'nullable|boolean',
            'randomize_answers' => 'nullable|boolean',
            'show_results_immediately' => 'nullable|boolean',
            'show_correct_answers' => 'nullable|boolean',
            'show_only_submitted_answers' => 'nullable|boolean',
            'allow_review' => 'nullable|boolean',
            'requires_manual_verification' => 'nullable|boolean',
            'question_source' => 'nullable|in:direct,bank',
            'question_set_id' => 'nullable',
            'question_selection' => 'nullable|array',
            'questions' => 'nullable|array',
            'questions.*.type' => 'required|string',
            'questions.*.content' => 'required|string',
            'questions.*.answers' => 'required|array',
            'questions.*.points' => 'nullable|integer|min:1',
            'questions.*.order' => 'nullable|integer|min:0',
            'questions.*.explanation' => 'nullable|string',
        ]);

        // question_set_id: normalizare
        if (isset($validated['question_set_id']) && ($validated['question_set_id'] === '' || $validated['question_set_id'] === null)) {
            $validated['question_set_id'] = null;
        } elseif (isset($validated['question_set_id']) && !\App\Models\QuestionBank::find($validated['question_set_id'])) {
            $validated['question_set_id'] = null;
        }

        $test = $this->testBuilderService->updateTest($test, $validated);

        return response()->json([
            'message' => 'Test updated successfully',
            'test' => $test->load(['questions', 'creator']),
        ]);
    }

    /**
     * Delete a test
     */
    public function destroy($id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți șterge doar testele tale.');
        }

        try {
            $this->testBuilderService->deleteTest($test);
            return response()->json([
                'message' => 'Test deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Publish a test
     */
    public function publish($id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        try {
            $test = $this->testBuilderService->publishTest($test);
            ActivityLog::create([
                'user_id' => auth()->id(),
                'action' => 'telemetry.admin_test_published',
                'model_type' => Test::class,
                'model_id' => $test->id,
                'description' => 'Telemetry event: admin_test_published',
                'new_values' => [
                    'question_source' => $test->question_source,
                    'published_at' => now()->toISOString(),
                ],
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
            return response()->json([
                'message' => 'Test published successfully',
                'test' => $test,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Link test to course
     */
    public function linkToCourse(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'scope' => 'required|in:lesson,module,course',
            'scope_id' => 'nullable|integer',
            'required' => 'nullable|boolean',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'order' => 'nullable|integer|min:0',
            'unlock_after_previous' => 'nullable|boolean',
            'unlock_after_test_id' => 'nullable|exists:tests,id',
        ]);

        $course = \App\Models\Course::findOrFail($validated['course_id']);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Poți atașa testul doar la cursurile tale.');
        }
        app(\App\Services\CourseBuilderService::class)
            ->attachTest($course, $test, $validated);

        return response()->json([
            'message' => 'Test linked to course successfully',
        ]);
    }

    /**
     * Get questions for a test (direct questions or bank questions, depending on question_source).
     */
    public function getQuestions($id)
    {
        $test = Test::with(['questions', 'questionBank.questions'])->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        if ($test->question_source === 'bank' && $test->questionBank) {
            return response()->json($test->questionBank->questions()->orderBy('order')->get());
        }

        return response()->json($test->questions()->orderBy('order')->get());
    }

    /**
     * Add a question to a test (direct question_source only).
     */
    public function addQuestion(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        if ($test->question_source === 'bank') {
            return response()->json([
                'error' => 'Cannot add direct questions when question_source is bank. Select a question bank or switch to direct.',
            ], 422);
        }

        $validated = $request->validate([
            'type' => 'required|string',
            'content' => 'nullable|string',
            'answers' => 'nullable|array',
            'points' => 'nullable|integer|min:0',
            'order' => 'nullable|integer|min:0',
            'explanation' => 'nullable|string',
            'metadata' => 'nullable|array',
        ]);

        $maxOrder = Question::where('test_id', $test->id)->max('order') ?? -1;

        $question = Question::create([
            'test_id' => $test->id,
            'question_bank_id' => null,
            'type' => $validated['type'],
            'content' => $validated['content'] ?? '',
            'answers' => $this->normalizeAnswersForType($validated['type'], $validated['answers'] ?? []),
            'points' => $validated['points'] ?? 1,
            'order' => $validated['order'] ?? ($maxOrder + 1),
            'explanation' => $validated['explanation'] ?? null,
            'metadata' => $validated['metadata'] ?? null,
        ]);

        $this->autoDistributePointsIfNoManual($test->id);

        return response()->json([
            'message' => 'Question added successfully',
            'question' => $question->fresh(),
        ], 201);
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

        if (in_array($type, ['single_choice', 'true_false', 'yes_no'], true)) {
            $correctIndex = null;
            foreach ($normalized as $idx => $answer) {
                if (! empty($answer['is_correct'])) {
                    $correctIndex = $idx;
                    break;
                }
            }

            $correctIndex ??= 0;
            foreach ($normalized as $idx => $answer) {
                $normalized[$idx]['is_correct'] = $idx === $correctIndex;
            }
        }

        return $normalized;
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

    /**
     * List all attempts for a test (admin review).
     */
    public function results($id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți vedea doar rezultatele testelor tale.');
        }

        $rows = TestResult::with(['user:id,name,email'])
            ->where('test_id', $test->id)
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->get()
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'attempt_number' => $row->attempt_number,
                    'score' => $row->score,
                    'max_score' => $row->max_score,
                    'percentage' => $row->percentage,
                    'passed' => (bool) $row->passed,
                    'completed_at' => $row->completed_at,
                    'needs_manual_review' => (bool) ($row->needs_manual_review ?? false),
                    'reviewed_at' => $row->reviewed_at,
                    'status' => $row->status,
                    'user' => [
                        'id' => $row->user?->id,
                        'name' => $row->user?->name,
                        'email' => $row->user?->email,
                    ],
                ];
            });

        return response()->json($rows->values());
    }

    /**
     * Summary statistics for a test (attempts, averages, pass rate).
     */
    public function statisticsSummary($id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți vedea doar statisticile testelor tale.');
        }

        $results = $this->testAnalyticsService->loadResults($test);

        return response()->json([
            'summary' => $this->testAnalyticsService->buildSummary($test, $results),
        ]);
    }

    /**
     * Item analysis per question for a test.
     */
    public function questionAnalytics($id)
    {
        $test = Test::with(['questions', 'questionBank.questions'])->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți vedea doar statisticile testelor tale.');
        }

        $results = $this->testAnalyticsService->loadResults($test);

        return response()->json($this->testAnalyticsService->buildQuestionAnalytics($test, $results));
    }

    /**
     * Per-question breakdown for a single test attempt (admin drill-down).
     */
    public function resultBreakdown($resultId)
    {
        $result = TestResult::with(['test', 'user:id,name,email'])->findOrFail($resultId);
        if (auth()->user()->isInstructor() && (int) $result->test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți vedea doar rezultatele testelor tale.');
        }

        return response()->json([
            'result' => [
                'id' => $result->id,
                'attempt_number' => $result->attempt_number,
                'score' => $result->score,
                'max_score' => $result->max_score,
                'percentage' => $result->percentage,
                'passed' => (bool) $result->passed,
                'completed_at' => $result->completed_at,
                'user' => [
                    'id' => $result->user?->id,
                    'name' => $result->user?->name,
                    'email' => $result->user?->email,
                ],
            ],
            'questions' => $this->testAnalyticsService->buildAttemptBreakdown($result),
        ]);
    }

    /**
     * Manually adjust the score for a test attempt.
     */
    public function updateResultScore(Request $request, $resultId)
    {
        $validated = $request->validate([
            'score' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:2000',
        ]);

        $result = TestResult::with('test')->findOrFail($resultId);
        if (auth()->user()->isInstructor() && (int) $result->test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți modifica doar rezultatele testelor tale.');
        }

        $maxScore = (int) ($result->max_score ?? 0);
        if ($maxScore <= 0) {
            $maxScore = 1;
        }

        $newScore = min((float) $validated['score'], (float) $maxScore);
        $newPercentage = round(($newScore / $maxScore) * 100, 2);

        $passingScore = $this->resolveResultPassingScore($result);
        $newPassed = $newPercentage >= $passingScore;

        $manualScores = is_array($result->manual_review_scores) ? $result->manual_review_scores : [];
        $previousScore = $result->score;
        $meta = is_array($manualScores['_meta'] ?? null) ? $manualScores['_meta'] : [];
        $meta['score_adjustment'] = [
            'previous_score' => $previousScore,
            'adjusted_score' => $newScore,
            'adjusted_at' => now()->toIso8601String(),
            'adjusted_by' => Auth::id(),
            'note' => $validated['note'] ?? null,
        ];
        $manualScores['_meta'] = $meta;

        $result->update([
            'score' => (int) round($newScore),
            'percentage' => $newPercentage,
            'passed' => $newPassed,
            'needs_manual_review' => false,
            'status' => 'completed',
            'reviewed_at' => $result->reviewed_at ?? now(),
            'reviewed_by' => Auth::id(),
            'manual_review_scores' => $manualScores,
        ]);

        \Illuminate\Support\Facades\Cache::forget("profile_user_{$result->user_id}");
        \Illuminate\Support\Facades\Cache::forget("dashboard_user_{$result->user_id}_stats");

        return response()->json([
            'message' => 'Punctajul a fost actualizat.',
            'result' => [
                'id' => $result->id,
                'score' => $result->score,
                'max_score' => $result->max_score,
                'percentage' => $result->percentage,
                'passed' => $result->passed,
                'status' => $result->status,
                'reviewed_at' => $result->reviewed_at,
            ],
        ]);
    }

    /**
     * Get test results pending manual review.
     */
    public function getPendingReviews(Request $request)
    {
        $results = $this->pendingReviewsQuery()
            ->with([
                'test' => fn($q) => $q->with(['questions', 'questionBank.questions', 'courses']),
                'user:id,name,email',
            ])
            ->orderBy('completed_at', 'desc')
            ->get();

        return response()->json($results);
    }

    /**
     * Doar numărul rezultatelor de revizuit (pentru badge), fără a încărca întrebările.
     */
    public function pendingReviewsCount(Request $request)
    {
        return response()->json(['count' => $this->pendingReviewsQuery()->count()]);
    }

    private function pendingReviewsQuery()
    {
        $query = TestResult::query()
            ->where(function ($q) {
                $q->where('status', 'pending_review')
                  ->orWhere('needs_manual_review', true);
            })
            ->whereNull('reviewed_at');
        if (auth()->user()->isInstructor()) {
            $query->whereHas('test', fn($q) => $q->where('created_by', auth()->id()));
        }

        return $query;
    }

    /**
     * Clear stale/invalid pending manual reviews.
     */
    public function clearPendingReviews(Request $request)
    {
        $validated = $request->validate([
            'older_than_days' => 'nullable|integer|min:0|max:3650',
        ]);

        $olderThanDays = (int) ($validated['older_than_days'] ?? 30);
        $cutoff = now()->subDays($olderThanDays);

        $query = TestResult::with([
            'test' => fn($q) => $q->with(['questions', 'questionBank.questions']),
        ])
            ->where(function ($q) {
                $q->where('status', 'pending_review')
                    ->orWhere('needs_manual_review', true);
            })
            ->whereNull('reviewed_at');

        if (auth()->user()->isInstructor()) {
            $query->whereHas('test', fn($q) => $q->where('created_by', auth()->id()));
        }

        $rows = $query->get();
        $manualTypes = ['essay'];
        $toClearIds = [];

        foreach ($rows as $row) {
            $isExpired = $row->completed_at && $row->completed_at->lt($cutoff);
            $hasInvalidState = ($row->status !== 'pending_review') && (bool) $row->needs_manual_review;

            $questions = collect();
            if ($row->test) {
                if ($row->test->question_source === 'bank' && $row->test->questionBank) {
                    $questions = $row->test->questionBank->questions ?? collect();
                } else {
                    $questions = $row->test->questions ?? collect();
                }
            }

            $hasManualQuestions = $questions->contains(function ($q) use ($manualTypes) {
                return in_array((string) ($q->type ?? ''), $manualTypes, true);
            });
            $hasErrorLikeState = !$row->test || !$hasManualQuestions;

            if ($isExpired || $hasInvalidState || $hasErrorLikeState) {
                $toClearIds[] = $row->id;
            }
        }

        if (empty($toClearIds)) {
            return response()->json([
                'message' => 'Nu au fost găsite încercări expirate/eronate pentru golire.',
                'cleared_count' => 0,
            ]);
        }

        $meta = [
            '_meta' => [
                'cleanup' => true,
                'reason' => 'auto_clear_pending_reviews',
                'cleaned_at' => now()->toIso8601String(),
                'cleaned_by' => Auth::id(),
            ],
        ];

        TestResult::whereIn('id', $toClearIds)->update([
            'needs_manual_review' => false,
            'status' => 'completed',
            'reviewed_at' => now(),
            'reviewed_by' => Auth::id(),
            'manual_review_scores' => $meta,
        ]);

        return response()->json([
            'message' => 'Coada de verificări a fost curățată.',
            'cleared_count' => count($toClearIds),
        ]);
    }

    public function suggestManualReviewFeedback(Request $request, $resultId)
    {
        $result = TestResult::with(['test.questions', 'test.questionBank.questions', 'user:id,name,email'])->findOrFail($resultId);
        if (auth()->user()->isInstructor() && (int) $result->test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți verifica doar rezultatele testelor tale.');
        }

        $questions = $result->test->question_source === 'bank' && $result->test->questionBank
            ? $result->test->questionBank->questions
            : $result->test->questions;

        $manualTypes = ['essay'];
        $manualQuestions = $questions->filter(fn ($q) => in_array((string) ($q->type ?? ''), $manualTypes, true))->values();
        if ($manualQuestions->isEmpty()) {
            return response()->json(['error' => 'Nu există întrebări deschise pentru feedback AI.'], 422);
        }

        $answers = is_array($result->answers) ? $result->answers : [];
        $items = $manualQuestions->map(function ($question) use ($answers) {
            return [
                'question_id' => (int) $question->id,
                'question' => (string) ($question->content ?? ''),
                'max_points' => max(1, (int) ($question->points ?? 1)),
                'expected_explanation' => (string) ($question->explanation ?? ''),
                'student_answer' => $this->extractManualAnswerText($answers, (int) $question->id),
            ];
        })->all();

        $prompt = $this->buildManualReviewFeedbackPrompt($result, $items);

        try {
            $raw = $this->callManualReviewAi($prompt);
            $parsed = $this->decodeJsonObject($raw);
            if (!$parsed || !is_array($parsed['scores'] ?? null)) {
                return response()->json(['error' => 'Formely AI nu a returnat sugestii valide.'], 422);
            }

            return response()->json($this->normalizeManualReviewSuggestions($parsed, $items));
        } catch (\Throwable $e) {
            Log::warning('Formely AI manual review feedback failed', [
                'result_id' => $result->id,
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => config('app.debug') ? $e->getMessage() : 'Nu s-au putut genera sugestiile Formely AI.',
            ], 500);
        }
    }

    private function extractManualAnswerText(array $answers, int $questionId): string
    {
        $raw = $answers[$questionId] ?? $answers[(string) $questionId] ?? null;
        if ($raw === null || $raw === '') {
            return '';
        }
        if (is_string($raw) || is_numeric($raw)) {
            return trim((string) $raw);
        }
        if (is_array($raw)) {
            foreach (['text', 'answer_text', 'value', 'answer'] as $key) {
                if (isset($raw[$key]) && (is_string($raw[$key]) || is_numeric($raw[$key]))) {
                    return trim((string) $raw[$key]);
                }
            }

            return trim(json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
        }

        return trim((string) $raw);
    }

    private function buildManualReviewFeedbackPrompt(TestResult $result, array $items): string
    {
        return "Ești Formely AI, asistent pentru evaluare educațională. Ajută profesorul să evalueze răspunsuri deschise.\n"
            . "IMPORTANT: Nu decide definitiv nota; oferi doar sugestii. Profesorul poate modifica tot.\n"
            . "Răspunde STRICT JSON valid cu schema:\n"
            . "{\"scores\":[{\"question_id\":1,\"suggested_score\":0,\"feedback\":\"feedback pentru elev\",\"rubric_criteria\":[\"criteriu\"]}],\"overall_feedback\":\"feedback general cu pași de remediere\",\"review_notes\":[\"observație pentru profesor\"]}\n"
            . "Reguli: scorul trebuie între 0 și max_points; feedback-ul în română, specific și constructiv; rubric_criteria max 4 criterii scurte; overall_feedback trebuie să includă 2-4 recomandări concrete de remediere/studiu.\n\n"
            . "Test: " . ($result->test?->title ?? 'Test') . "\n"
            . "Elev: " . ($result->user?->name ?? $result->user?->email ?? 'Elev') . "\n"
            . "Întrebări și răspunsuri:\n"
            . json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function callManualReviewAi(string $prompt): string
    {
        $provider = (string) config('ai.provider', 'groq');
        if ($provider === 'groq') {
            $apiKey = (string) config('ai.groq.api_key', '');
            $apiUrl = (string) config('ai.groq.api_url', 'https://api.groq.com/openai/v1');
            $model = (string) (config('ai.groq.creator_model') ?: config('ai.groq.model', 'llama-3.1-8b-instant'));
        } else {
            $apiKey = (string) config('ai.openai.api_key', '');
            $apiUrl = (string) config('ai.openai.api_url', 'https://api.openai.com/v1');
            $model = (string) (config('ai.openai.creator_model') ?: config('ai.openai.model', 'gpt-4o-mini'));
        }

        if (!$apiKey) {
            throw new \RuntimeException('Cheia AI nu este configurată.');
        }

        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer {$apiKey}",
        ])->withOptions([
            'verify' => (bool) config('ai.verify_ssl', true),
        ])->timeout(90)->post(rtrim($apiUrl, '/') . '/chat/completions', [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => 'Ești Formely AI. Returnezi doar JSON valid pentru sugestii de evaluare.'],
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.2,
            'max_tokens' => 1800,
            'response_format' => ['type' => 'json_object'],
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('AI feedback error: ' . $response->body());
        }

        $content = $response->json('choices.0.message.content');
        if (!is_string($content) || trim($content) === '') {
            throw new \RuntimeException('Răspuns AI gol.');
        }

        return $content;
    }

    private function decodeJsonObject(string $raw): ?array
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

    private function normalizeManualReviewSuggestions(array $parsed, array $items): array
    {
        $maxByQuestion = collect($items)->mapWithKeys(fn ($item) => [
            (int) $item['question_id'] => max(1, (int) ($item['max_points'] ?? 1)),
        ])->all();

        $scores = [];
        foreach ($parsed['scores'] ?? [] as $row) {
            $qid = (int) ($row['question_id'] ?? 0);
            if (!$qid || !isset($maxByQuestion[$qid])) {
                continue;
            }
            $max = $maxByQuestion[$qid];
            $score = (float) ($row['suggested_score'] ?? 0);
            $scores[] = [
                'question_id' => $qid,
                'suggested_score' => min(max($score, 0), $max),
                'feedback' => mb_substr((string) ($row['feedback'] ?? ''), 0, 2000),
                'rubric_criteria' => array_values(array_slice(array_filter($row['rubric_criteria'] ?? []), 0, 4)),
            ];
        }

        return [
            'scores' => $scores,
            'overall_feedback' => mb_substr((string) ($parsed['overall_feedback'] ?? ''), 0, 4000),
            'review_notes' => array_values(array_slice(array_filter($parsed['review_notes'] ?? []), 0, 6)),
        ];
    }

    /**
     * Submit manual review for a test result
     */
    public function submitManualReview(Request $request, $resultId)
    {
        $validated = $request->validate([
            'manual_review_scores' => 'required|array',
            'manual_review_scores.*.question_id' => 'required|integer',
            'manual_review_scores.*.score' => 'required|numeric|min:0',
            'manual_review_scores.*.feedback' => 'nullable|string|max:2000',
            'manual_review_scores.*.rubric_criteria' => 'nullable|array',
            'manual_review_scores.*.rubric_criteria.*' => 'nullable|string|max:255',
            'overall_feedback' => 'nullable|string|max:4000',
        ]);

        $result = TestResult::with(['test.questions', 'test.questionBank.questions'])->findOrFail($resultId);
        if (auth()->user()->isInstructor() && (int) $result->test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți verifica doar rezultatele testelor tale.');
        }

        if ($result->reviewed_at) {
            return response()->json([
                'error' => 'Acest rezultat a fost deja verificat.',
            ], 422);
        }

        $autoScore = (int) $result->score;
        $manualScore = 0;
        $manualScores = [];

        $questions = collect();
        $hydrated = app(\App\Services\TestAttemptService::class)->hydrateQuestions($result->question_snapshot);
        if ($hydrated->isNotEmpty()) {
            $questions = $hydrated;
        } elseif ($result->test) {
            $questions = $result->test->question_source === 'bank' && $result->test->questionBank
                ? $result->test->questionBank->questions
                : $result->test->questions;
        }
        $questionIds = $questions->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($validated['manual_review_scores'] as $reviewScore) {
            $qid = (int) $reviewScore['question_id'];
            if (!in_array($qid, $questionIds, true)) {
                continue;
            }
            $question = $questions->firstWhere('id', $qid);
            if (!$question) continue;

            $manualTypes = ['essay'];
            if (!in_array($question->type ?? '', $manualTypes, true)) {
                continue;
            }

            $maxPoints = (int) ($question->points ?? 1);
            $givenScore = min((float) $reviewScore['score'], $maxPoints);
            if (isset($manualScores[$qid])) {
                continue;
            }
            $manualScore += $givenScore;
            $manualScores[$qid] = [
                'score' => $givenScore,
                'feedback' => $reviewScore['feedback'] ?? null,
                'rubric_criteria' => array_values(array_filter($reviewScore['rubric_criteria'] ?? [])),
            ];
        }

        if (!empty($validated['overall_feedback'])) {
            $manualScores['_meta'] = [
                'overall_feedback' => $validated['overall_feedback'],
            ];
        }

        $totalPoints = (int) ($result->max_score ?? 0) ?: 1;
        $newTotalScore = min($autoScore + $manualScore, $totalPoints);
        $newPercentage = $totalPoints > 0 ? round(($newTotalScore / $totalPoints) * 100, 2) : 0;
        $newPercentage = min(100, max(0, $newPercentage));

        $passingScore = $this->resolveResultPassingScore($result);
        $newPassed = $newPercentage >= $passingScore;

        $result->update([
            'score' => $newTotalScore,
            'percentage' => $newPercentage,
            'passed' => $newPassed,
            'needs_manual_review' => false,
            'manual_review_scores' => $manualScores,
            'reviewed_at' => now(),
            'reviewed_by' => Auth::id(),
            'status' => 'completed',
        ]);

        \Illuminate\Support\Facades\Cache::forget("profile_user_{$result->user_id}");
        \Illuminate\Support\Facades\Cache::forget("dashboard_user_{$result->user_id}_stats");

        return response()->json([
            'message' => 'Verificare manuală salvată cu succes',
            'result' => $result->load(['test', 'user:id,name,email']),
        ]);
    }

    private function resolveResultPassingScore(TestResult $result): int
    {
        if ($result->passing_score_applied !== null && $result->passing_score_applied !== '') {
            return (int) $result->passing_score_applied;
        }
        $base = (int) ($result->test->passing_score ?? 70);
        $query = \App\Models\CourseTest::where('test_id', $result->test_id);
        if ($result->course_id) {
            $query->where('course_id', $result->course_id);
        }
        $courseTest = $query->first();
        if ($courseTest && $courseTest->passing_score !== null) {
            return (int) $courseTest->passing_score;
        }

        return $base;
    }
}
