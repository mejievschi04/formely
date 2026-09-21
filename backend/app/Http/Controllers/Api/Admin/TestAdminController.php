<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Test;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\TestResult;
use App\Models\ActivityLog;
use App\Services\PromoteTestToStandaloneExamService;
use App\Services\TestAnalyticsService;
use App\Services\TestBuilderService;
use App\Services\TestQuestionSelectionService;
use App\Services\AiQuestionGenerationService;
use App\Services\CourseBuilderService;
use App\Http\Controllers\Concerns\AssertsPlanEntitlements;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TestAdminController
 * 
 * Handles standalone test creation and management
 * Tests are created independently and can be linked to courses later
 */
class TestAdminController extends Controller
{
    use AssertsPlanEntitlements;

    protected TestBuilderService $testBuilderService;
    protected TestQuestionSelectionService $questionSelectionService;
    protected PromoteTestToStandaloneExamService $promoteTestToExam;
    protected TestAnalyticsService $testAnalyticsService;
    protected AiQuestionGenerationService $aiQuestionGeneration;
    protected CourseBuilderService $courseBuilderService;

    public function __construct(
        TestBuilderService $testBuilderService,
        TestQuestionSelectionService $questionSelectionService,
        PromoteTestToStandaloneExamService $promoteTestToExam,
        TestAnalyticsService $testAnalyticsService,
        AiQuestionGenerationService $aiQuestionGeneration,
        CourseBuilderService $courseBuilderService
    ) {
        $this->testBuilderService = $testBuilderService;
        $this->questionSelectionService = $questionSelectionService;
        $this->promoteTestToExam = $promoteTestToExam;
        $this->testAnalyticsService = $testAnalyticsService;
        $this->aiQuestionGeneration = $aiQuestionGeneration;
        $this->courseBuilderService = $courseBuilderService;
    }

    /**
     * List all tests
     */
    public function index(Request $request)
    {
        $query = Test::with(['creator', 'questionBank'])->withCount('questions');

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

        $tests = $query->orderBy('created_at', 'desc')->paginate(20);

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

        $test = $this->testBuilderService->createTest($validated, $creator);

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
     * Creează un examen independent din acest test (pentru catalogul Cursuri → Examene).
     * Testul original rămâne; elevii la examen folosesc noul Exam.
     */
    public function promoteToStandaloneExam($id)
    {
        $test = Test::with(['questions', 'questionBank'])->findOrFail($id);
        $user = auth()->user();

        if ($user->isInstructor() && (int) $test->created_by !== (int) $user->id) {
            abort(403, 'Acces interzis.');
        }

        try {
            $exam = $this->promoteTestToExam->promote($test, $user);

            return response()->json([
                'message' => 'Examen independent creat din test. Elevii îl vor vedea la Cursuri → Examene după publicare.',
                'exam' => [
                    'id' => $exam->id,
                    'title' => $exam->title,
                    'status' => $exam->status,
                    'questions_count' => $exam->questions?->count() ?? 0,
                ],
                'test_id' => $test->id,
            ], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            \Log::error('promoteToStandaloneExam failed', [
                'test_id' => $test->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Nu am putut crea examenul din test.',
            ], 500);
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
     * Unlink test from course
     */
    public function unlinkFromCourse(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'scope' => 'nullable|in:lesson,module,course',
            'scope_id' => 'nullable|integer',
        ]);

        $course = \App\Models\Course::findOrFail($validated['course_id']);
        if (auth()->user()->isInstructor() && ((int) $test->created_by !== (int) auth()->id() || (int) $course->teacher_id !== (int) auth()->id())) {
            abort(403, 'Acces interzis.');
        }
        app(\App\Services\CourseBuilderService::class)
            ->detachTest(
                $course,
                $test,
                $validated['scope'] ?? null,
                $validated['scope_id'] ?? null
            );

        return response()->json([
            'message' => 'Test unlinked from course successfully',
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

    /**
     * Reorder questions for a test (direct question_source only).
     */
    public function reorderQuestions(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        if ($test->question_source === 'bank') {
            return response()->json([
                'error' => 'Cannot reorder direct questions when question_source is bank. Reorder questions in the selected Question Bank instead.',
            ], 422);
        }

        $validated = $request->validate([
            'question_ids' => 'required|array|min:1',
            'question_ids.*' => 'integer',
        ]);

        $ids = array_values(array_unique($validated['question_ids']));

        $count = Question::where('test_id', $test->id)->whereIn('id', $ids)->count();
        if ($count !== count($ids)) {
            return response()->json([
                'error' => 'Invalid question_ids: some questions do not belong to this test.',
            ], 422);
        }

        DB::transaction(function () use ($test, $ids) {
            foreach ($ids as $index => $qid) {
                Question::where('test_id', $test->id)->where('id', $qid)->update(['order' => $index]);
            }
        });

        return response()->json([
            'message' => 'Questions reordered successfully',
            'questions' => Question::where('test_id', $test->id)->orderBy('order')->get(),
        ]);
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

    /**
     * Preview question selection for this test (useful for bank rules).
     */
    public function selectionPreview(Request $request, $id)
    {
        $test = Test::with(['questions', 'questionBank.questions'])->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        if ($test->question_source !== 'bank' || (!$test->questionBank && empty($test->question_selection['folder_ids'] ?? []))) {
            $qs = $test->questions()->orderBy('order')->get();
            return response()->json([
                'mode' => 'direct',
                'bank_total' => 0,
                'matched_total' => $qs->count(),
                'selected_total' => $qs->count(),
                'selected' => $qs,
                'note' => 'Test uses direct questions (no bank rules).',
            ]);
        }

        $selection = is_array($test->question_selection) ? $test->question_selection : [];
        $mode = (string) ($selection['mode'] ?? 'random');
        $preview = $this->questionSelectionService->preview($test, $request->input('variant'));
        $selected = $preview['selected'];
        $matched = $preview['matched'];
        $all = $preview['all'];

        return response()->json([
            'mode' => $mode,
            'variant' => $preview['variant'],
            'variant_pool_size' => $preview['variant_pool_size'],
            'seed' => $preview['seed'],
            'include_starred' => $preview['include_starred'],
            'starred_selected' => $selected->filter(fn ($q) => (bool) $q->is_starred)->count(),
            'bank_total' => $all->count(),
            'matched_total' => $matched->count(),
            'selected_total' => $selected->count(),
            'selected' => $selected,
            'note' => 'Preview uses a stable seed. Student attempts use a per-user/per-attempt deterministic seed.',
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

    /**
     * Get test results pending manual review.
     */
    public function getPendingReviews(Request $request)
    {
        $query = TestResult::with([
            'test' => fn($q) => $q->with(['questions', 'questionBank.questions', 'courses']),
            'user:id,name,email',
        ])
            ->where(function ($q) {
                $q->where('status', 'pending_review')
                  ->orWhere('needs_manual_review', true);
            })
            ->whereNull('reviewed_at');
        if (auth()->user()->isInstructor()) {
            $query->whereHas('test', fn($q) => $q->where('created_by', auth()->id()));
        }
        $results = $query->orderBy('completed_at', 'desc')->get();

        return response()->json($results);
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

            $requiresManual = (bool) ($row->test->requires_manual_verification ?? false);
            $hasManualQuestions = $questions->contains(fn ($q) => $q->requiresManualGrading());
            $hasErrorLikeState = ! $row->test || (! $requiresManual && ! $hasManualQuestions);

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

        $questions = $result->test->question_source === 'bank' && $result->test->questionBank
            ? $result->test->questionBank->questions
            : $result->test->questions;
        $questionIds = $questions->pluck('id')->toArray();

        foreach ($validated['manual_review_scores'] as $reviewScore) {
            $qid = (int) $reviewScore['question_id'];
            if (!in_array($qid, $questionIds, true)) {
                continue;
            }
            $question = $questions->firstWhere('id', $qid);
            if (!$question) continue;

            if (! $question->requiresManualGrading()) {
                continue;
            }

            $maxPoints = (int) ($question->points ?? 1);
            $givenScore = min((float) $reviewScore['score'], $maxPoints);
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
        $newTotalScore = $autoScore + $manualScore;
        $newPercentage = $totalPoints > 0 ? round(($newTotalScore / $totalPoints) * 100, 2) : 0;

        $courseTest = \App\Models\CourseTest::where('test_id', $result->test_id)->first();
        $passingScore = $courseTest ? ($courseTest->passing_score ?? 70) : 70;
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

    /**
     * List student results for a test (TestResult only — not ExamResult).
     */
    public function results(Request $request, $id)
    {
        $test = Test::findOrFail($id);
        $this->assertTestAccessibleByInstructor($test);

        if (! Schema::hasTable('test_results')) {
            return response()->json([]);
        }

        $query = TestResult::with(['user:id,name,email', 'course:id,title'])
            ->where('test_id', $test->id)
            ->orderByDesc('completed_at');

        if ($request->filled('course_id')) {
            $query->where('course_id', (int) $request->course_id);
        }

        $rows = $query->get()->map(function ($row) {
            $status = $row->reviewed_at
                ? 'approved'
                : ($row->needs_manual_review ? 'pending' : ($row->status ?? 'completed'));

            return [
                'id' => $row->id,
                'attempt_number' => $row->attempt_number,
                'score' => $row->score,
                'max_score' => $row->max_score,
                'percentage' => $row->percentage,
                'passed' => $row->passed,
                'completed_at' => $row->completed_at,
                'needs_manual_review' => $row->needs_manual_review,
                'reviewed_at' => $row->reviewed_at,
                'status' => $status,
                'course_id' => $row->course_id,
                'course' => $row->course ? [
                    'id' => $row->course->id,
                    'title' => $row->course->title,
                ] : null,
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
     * Per-question analytics for a test (TestResult answers).
     */
    public function questionAnalytics(Request $request, $id)
    {
        $test = Test::with(['questionBank.questions'])->findOrFail($id);
        $this->assertTestAccessibleByInstructor($test);

        if (! Schema::hasTable('test_results')) {
            return response()->json([]);
        }

        $resultsQuery = TestResult::where('test_id', $test->id)->orderByDesc('completed_at');
        if ($request->filled('course_id')) {
            $resultsQuery->where('course_id', (int) $request->course_id);
        }

        $results = $resultsQuery->get(['answers', 'manual_review_scores']);
        $attemptsCount = $results->count();
        $questions = $this->resolveQuestionsForTestAnalytics($test, $results);

        $rows = $questions
            ->sortBy('order')
            ->values()
            ->map(function ($question) use ($results, $attemptsCount) {
                return $this->buildTestQuestionAnalyticsRow($question, $results, $attemptsCount);
            });

        return response()->json($rows->values());
    }

    protected function assertTestAccessibleByInstructor(Test $test): void
    {
        if (auth()->user()->isInstructor() && (int) $test->created_by !== (int) auth()->id()) {
            abort(403, 'Acces interzis. Poți accesa doar testele tale.');
        }
    }

    protected function resolveQuestionsForTestAnalytics(Test $test, Collection $results): Collection
    {
        $questionIds = [];
        foreach ($results as $result) {
            $stored = is_array($result->answers) ? $result->answers : [];
            foreach (array_keys($stored) as $key) {
                if (is_numeric($key)) {
                    $questionIds[] = (int) $key;
                }
            }
        }

        $questionIds = array_values(array_unique($questionIds));
        if ($questionIds !== []) {
            return Question::whereIn('id', $questionIds)->get();
        }

        if ($test->question_source === 'bank' && $test->questionBank) {
            return $test->questionBank->questions ?? collect();
        }

        return $test->questions()->orderBy('order')->get();
    }

    protected function buildTestQuestionAnalyticsRow(Question $question, Collection $results, int $attemptsCount): array
    {
        $questionIdKey = (string) $question->id;
        $questionType = (string) ($question->type ?? 'multiple_choice');
        $isChoiceType = in_array($questionType, ['multiple_choice', 'single_choice', 'true_false'], true);
        $answersJson = is_array($question->answers) ? array_values($question->answers) : [];
        $correctIndices = $this->correctOriginalIndicesForQuestion($questionType, $answersJson);
        $correctIndex = $correctIndices[0] ?? null;

        $optionStats = [];
        foreach ($answersJson as $idx => $answer) {
            $optionStats[$idx] = [
                'index' => $idx,
                'text' => $this->answerOptionText($answer),
                'count' => 0,
                'percentage' => 0,
                'is_correct' => is_array($answer) && ($answer['is_correct'] ?? false),
            ];
        }

        $answeredCount = 0;
        $skippedCount = 0;
        $correctCount = 0;
        $manualScores = [];

        foreach ($results as $result) {
            $resultAnswers = is_array($result->answers) ? $result->answers : [];
            $rawValue = $resultAnswers[$questionIdKey] ?? $resultAnswers[(int) $question->id] ?? null;
            $hasAnswer = ! ($rawValue === null || $rawValue === '' || (is_array($rawValue) && $rawValue === []));

            if (! $hasAnswer) {
                $skippedCount++;
            } else {
                $answeredCount++;
            }

            if ($isChoiceType && $hasAnswer) {
                $selectedIndices = $this->selectedChoiceIndices($rawValue, $questionType);
                foreach ($selectedIndices as $selectedIndex) {
                    if (array_key_exists($selectedIndex, $optionStats)) {
                        $optionStats[$selectedIndex]['count']++;
                    }
                }
                if ($this->isStoredChoiceCorrect($rawValue, $questionType, $correctIndices)) {
                    $correctCount++;
                }
            }

            if (! $isChoiceType) {
                $manualMap = is_array($result->manual_review_scores) ? $result->manual_review_scores : [];
                $manualEntry = $manualMap[$questionIdKey] ?? $manualMap[(int) $question->id] ?? null;
                if (is_array($manualEntry) && isset($manualEntry['score']) && is_numeric($manualEntry['score'])) {
                    $manualScores[] = (float) $manualEntry['score'];
                } elseif ($manualEntry !== null && is_numeric($manualEntry)) {
                    $manualScores[] = (float) $manualEntry;
                }
            }
        }

        $attemptBase = max(1, $attemptsCount);
        foreach ($optionStats as &$stat) {
            $stat['percentage'] = round(($stat['count'] / $attemptBase) * 100, 2);
        }
        unset($stat);

        return [
            'question_id' => $question->id,
            'question_text' => $question->content,
            'question_type' => $questionType,
            'points' => (int) ($question->points ?? 1),
            'attempts_count' => $attemptsCount,
            'answered_count' => $answeredCount,
            'skipped_count' => $skippedCount,
            'correct_count' => $isChoiceType ? $correctCount : null,
            'correct_rate' => $isChoiceType
                ? round(($correctCount / $attemptBase) * 100, 2)
                : null,
            'average_score' => count($manualScores) > 0
                ? round(array_sum($manualScores) / count($manualScores), 2)
                : null,
            'correct_option_index' => $correctIndex,
            'option_stats' => array_values($optionStats),
            'manual_avg_score' => count($manualScores) > 0 ? round(array_sum($manualScores) / count($manualScores), 2) : null,
            'manual_reviews_count' => count($manualScores),
        ];
    }

    protected function answerOptionText(mixed $answer): string
    {
        if (is_array($answer)) {
            return (string) ($answer['text'] ?? $answer['answer'] ?? '');
        }

        return (string) $answer;
    }

    /**
     * @return int[]
     */
    protected function correctOriginalIndicesForQuestion(string $questionType, array $answersJson): array
    {
        $indices = [];
        foreach ($answersJson as $idx => $answer) {
            if (is_array($answer) && ($answer['is_correct'] ?? false)) {
                $indices[] = (int) $idx;
            }
        }

        if ($questionType === 'single_choice' || $questionType === 'true_false') {
            return $indices !== [] ? [$indices[0]] : [];
        }

        return array_values(array_unique($indices));
    }

    /**
     * @return int[]
     */
    protected function selectedChoiceIndices(mixed $stored, string $questionType): array
    {
        if ($questionType === 'multiple_choice') {
            if (is_array($stored) && array_is_list($stored)) {
                return array_values(array_filter(array_map(
                    fn ($item) => is_numeric($item) ? (int) $item : null,
                    $stored
                )));
            }

            return is_numeric($stored) ? [(int) $stored] : [];
        }

        return is_numeric($stored) ? [(int) $stored] : [];
    }

    /**
     * @param  int[]  $correctIndices
     */
    protected function isStoredChoiceCorrect(mixed $stored, string $questionType, array $correctIndices): bool
    {
        $selected = $this->selectedChoiceIndices($stored, $questionType);
        if ($selected === [] || $correctIndices === []) {
            return false;
        }

        if ($questionType === 'multiple_choice') {
            sort($selected);
            $correct = array_map('intval', $correctIndices);
            sort($correct);

            return $selected === $correct;
        }

        return in_array($selected[0], $correctIndices, true);
    }

    /**
     * Export TestResult rows as CSV (optional filters: test_id, course_id, team_id, date_from, date_to).
     */
    public function exportResultsCsv(Request $request): StreamedResponse
    {
        if (! Schema::hasTable('test_results')) {
            abort(404, 'Nu există rezultate de exportat.');
        }

        $validated = $request->validate([
            'test_id' => 'nullable|integer|exists:tests,id',
            'course_id' => 'nullable|integer|exists:courses,id',
            'team_id' => 'nullable|integer|exists:teams,id',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
        ]);

        if (! empty($validated['test_id'])) {
            $this->assertTestAccessibleByInstructor(Test::findOrFail((int) $validated['test_id']));
        }

        $rows = $this->buildTestResultsExportRows($validated);
        $filename = 'rezultate-teste_' . now()->format('Y-m-d_His') . '.csv';

        return response()->streamDownload(function () use ($rows) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, [
                'Data finalizare',
                'Elev',
                'Email',
                'Curs',
                'Test',
                'Incercare',
                'Scor',
                'Max scor',
                'Procent',
                'Promovat',
                'Status',
            ]);
            foreach ($rows as $row) {
                fputcsv($handle, [
                    $row['completed_at'],
                    $row['user_name'],
                    $row['user_email'],
                    $row['course_title'],
                    $row['test_title'],
                    $row['attempt_number'],
                    $row['score'],
                    $row['max_score'],
                    $row['percentage'],
                    $row['passed'],
                    $row['status'],
                ]);
            }
            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Export CSV for a single test (TestResult only).
     */
    public function exportTestResultsCsv(Request $request, $id): StreamedResponse
    {
        $request->merge(['test_id' => (int) $id]);

        return $this->exportResultsCsv($request);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    protected function buildTestResultsExportRows(array $filters): Collection
    {
        $query = TestResult::with(['user:id,name,email', 'test:id,title', 'course:id,title'])
            ->orderByDesc('completed_at');

        if (auth()->user()->isInstructor()) {
            $query->whereHas('test', function ($testQuery) {
                $testQuery->where('created_by', auth()->id());
            });
        }

        if (! empty($filters['test_id'])) {
            $query->where('test_id', (int) $filters['test_id']);
        }

        if (! empty($filters['course_id'])) {
            $query->where('course_id', (int) $filters['course_id']);
        }

        if (! empty($filters['team_id']) && Schema::hasTable('team_user')) {
            $teamUserIds = DB::table('team_user')
                ->where('team_id', (int) $filters['team_id'])
                ->pluck('user_id');
            $query->whereIn('user_id', $teamUserIds);
        }

        if (! empty($filters['date_from'])) {
            $query->whereDate('completed_at', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('completed_at', '<=', $filters['date_to']);
        }

        return $query->get()->map(function (TestResult $row) {
            $status = $row->reviewed_at
                ? 'approved'
                : ($row->needs_manual_review ? 'pending' : ($row->status ?? 'completed'));

            return [
                'completed_at' => $row->completed_at?->format('Y-m-d H:i:s') ?? '',
                'user_name' => $row->user?->name ?? '',
                'user_email' => $row->user?->email ?? '',
                'course_title' => $row->course?->title ?? '',
                'test_title' => $row->test?->title ?? '',
                'attempt_number' => $row->attempt_number ?? 1,
                'score' => $row->score,
                'max_score' => $row->max_score,
                'percentage' => $row->percentage,
                'passed' => $row->passed ? 'da' : 'nu',
                'status' => $status,
            ];
        });
    }

    public function statisticsSummary($id)
    {
        $test = Test::findOrFail($id);
        $this->assertTestAccessibleByInstructor($test);

        $results = $this->testAnalyticsService->loadResults($test);

        return response()->json([
            'summary' => $this->testAnalyticsService->buildSummary($test, $results),
        ]);
    }

    public function resultBreakdown($resultId)
    {
        $result = TestResult::with(['test', 'user:id,name,email'])->findOrFail($resultId);
        $this->assertTestAccessibleByInstructor($result->test);

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

    public function updateResultScore(Request $request, $resultId)
    {
        $validated = $request->validate([
            'score' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:2000',
        ]);

        $result = TestResult::with('test')->findOrFail($resultId);
        $this->assertTestAccessibleByInstructor($result->test);

        $maxScore = (int) ($result->max_score ?? 0);
        if ($maxScore <= 0) {
            $maxScore = 1;
        }

        $newScore = min((float) $validated['score'], (float) $maxScore);
        $newPercentage = round(($newScore / $maxScore) * 100, 2);

        $courseTest = \App\Models\CourseTest::where('test_id', $result->test_id)->first();
        $passingScore = $courseTest
            ? (int) ($courseTest->passing_score ?? $result->test->passing_score ?? 70)
            : (int) ($result->test->passing_score ?? 70);
        $newPassed = $newPercentage >= $passingScore;

        $manualScores = is_array($result->manual_review_scores) ? $result->manual_review_scores : [];
        $meta = is_array($manualScores['_meta'] ?? null) ? $manualScores['_meta'] : [];
        $meta['score_adjustment'] = [
            'previous_score' => $result->score,
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
     * Preview AI-generated test questions from course content (no DB write).
     */
    public function suggestBlueprintFromCourse(Request $request)
    {
        $this->assertCompanyFeature('ai_test_generation');

        $validated = $request->validate([
            'source_type' => 'nullable|in:course,document',
            'course_id' => 'nullable|integer|exists:courses,id|required_if:source_type,course',
            'document' => 'nullable|array|required_if:source_type,document',
            'document.file_name' => 'nullable|string|max:255',
            'document.name' => 'nullable|string|max:255',
            'document.type' => 'nullable|string|max:50',
            'document.text' => 'nullable|string',
            'document.preview' => 'nullable|string',
            'scope' => 'nullable|in:course,module,lesson',
            'scope_id' => 'nullable|integer',
            'type' => 'nullable|in:practice,graded,final',
        ]);

        try {
            $source = $this->resolveAiSourceFromRequest($validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $blueprint = $this->buildAiBlueprintFromText(
            $source['content'],
            $source['source_label'],
            $validated['type'] ?? 'practice',
            $source['source_type'] === 'course' ? ($source['course'] ?? null) : null,
            $source['scope'] ?? 'course',
            $validated['scope_id'] ?? null,
            $source['module_id'] ?? null,
            $source['lesson_id'] ?? null
        );

        return response()->json([
            'message' => 'Blueprint suggested successfully',
            'blueprint' => $blueprint,
            'source_type' => $source['source_type'],
        ]);
    }

    /**
     * Preview AI-generated test questions from course content (no DB write).
     */
    public function previewFromCourse(Request $request)
    {
        $this->assertCompanyFeature('ai_test_generation');

        @set_time_limit(0);

        $validated = $request->validate([
            'source_type' => 'nullable|in:course,document',
            'course_id' => 'nullable|integer|exists:courses,id|required_if:source_type,course',
            'document' => 'nullable|array|required_if:source_type,document',
            'document.file_name' => 'nullable|string|max:255',
            'document.name' => 'nullable|string|max:255',
            'document.type' => 'nullable|string|max:50',
            'document.text' => 'nullable|string',
            'document.preview' => 'nullable|string',
            'scope' => 'nullable|in:course,module,lesson',
            'scope_id' => 'nullable|integer',
            'numberOfQuestions' => 'nullable|integer|min:1|max:50',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'questionTypes' => 'nullable|array',
            'qualityMode' => 'nullable|in:fast,balanced,high_stakes',
            'cognitiveLevels' => 'nullable|array',
            'cognitiveLevels.*' => 'in:recall,understanding,application,analysis',
            'type' => 'nullable|in:practice,graded,final',
        ]);

        try {
            $source = $this->resolveAiSourceFromRequest($validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $difficulty = $validated['difficulty'] ?? 'medium';
        $questionTypes = is_array($validated['questionTypes'] ?? null)
            ? $validated['questionTypes']
            : ['multiple_choice'];
        $count = max(1, (int) ($validated['numberOfQuestions'] ?? 10));
        $testType = $validated['type'] ?? 'practice';
        $qualityMode = $validated['qualityMode'] ?? 'balanced';
        $cognitiveLevels = is_array($validated['cognitiveLevels'] ?? null)
            ? $validated['cognitiveLevels']
            : [];

        try {
            $questions = $this->aiQuestionGeneration->generateQuestionsFromContent(
                $source['content'],
                $count,
                $difficulty,
                $questionTypes,
                $qualityMode,
                $cognitiveLevels
            );
        } catch (\Exception $e) {
            Log::error('Formely AI test preview generation failed', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => 'Eroare la generarea testului Formely AI: ' . ($e->getMessage() ?: 'Problema AI'),
            ], 500);
        }

        if (empty($questions)) {
            return response()->json([
                'error' => 'Nu s-au putut genera întrebări din sursa selectată.',
            ], 422);
        }

        if ($source['source_type'] === 'document') {
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithDocumentMetadata(
                $questions,
                $source['document']['file_name'],
                $difficulty,
                $source['document']['type'] ?? null,
                $qualityMode,
                $cognitiveLevels
            );
            $suggested = $this->aiQuestionGeneration->suggestTestMetadataFromDocument(
                $source['document']['file_name'],
                $testType
            );
            $coverageReport = $this->buildAiCoverageReportFromDocument(
                $source['document']['file_name'],
                $source['content'],
                $questions,
                $count,
                $questionTypes,
                $qualityMode,
                $cognitiveLevels
            );
        } else {
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithSourceMetadata(
                $questions,
                (int) $source['course_id'],
                $difficulty,
                $source['module_id'],
                $source['lesson_id'],
                $qualityMode,
                $cognitiveLevels
            );
            $suggested = $this->aiQuestionGeneration->suggestTestMetadata($source['course'], $testType);
            $coverageReport = $this->buildAiCoverageReport(
                $source['course'],
                $questions,
                $count,
                $questionTypes,
                $source['scope'],
                $validated['scope_id'] ?? null,
                $source['module_id'],
                $source['lesson_id'],
                $qualityMode,
                $cognitiveLevels
            );
        }

        return response()->json([
            'message' => 'Preview generated successfully',
            'suggested' => $suggested,
            'questions' => $questions,
            'questions_generated' => count($questions),
            'coverage_report' => $coverageReport,
            'quality_mode' => $qualityMode,
            'cognitive_levels' => $cognitiveLevels,
            'source_type' => $source['source_type'],
            'course_id' => $source['course_id'],
            'scope' => $source['scope'],
            'scope_id' => $validated['scope_id'] ?? null,
            'document' => $source['document'] ?? null,
        ]);
    }
    /**
     * Regenerate one Formely AI question from the same course source (no DB write).
     */
    public function regenerateQuestionFromCourse(Request $request)
    {
        $this->assertCompanyFeature('ai_test_generation');

        @set_time_limit(0);

        $validated = $request->validate([
            'source_type' => 'nullable|in:course,document',
            'course_id' => 'nullable|integer|exists:courses,id|required_if:source_type,course',
            'document' => 'nullable|array|required_if:source_type,document',
            'document.file_name' => 'nullable|string|max:255',
            'document.name' => 'nullable|string|max:255',
            'document.type' => 'nullable|string|max:50',
            'document.text' => 'nullable|string',
            'document.preview' => 'nullable|string',
            'scope' => 'nullable|in:course,module,lesson',
            'scope_id' => 'nullable|integer',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'qualityMode' => 'nullable|in:fast,balanced,high_stakes',
            'cognitiveLevels' => 'nullable|array',
            'cognitiveLevels.*' => 'in:recall,understanding,application,analysis',
            'questionType' => 'nullable|in:multiple_choice,single_choice,true_false,matching,ordering',
            'instructions' => 'nullable|string|max:1200',
            'blockedQuestions' => 'nullable|array',
            'blockedQuestions.*' => 'string',
        ]);

        try {
            $source = $this->resolveAiSourceFromRequest($validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $difficulty = $validated['difficulty'] ?? 'medium';
        $qualityMode = $validated['qualityMode'] ?? 'balanced';
        $cognitiveLevels = is_array($validated['cognitiveLevels'] ?? null)
            ? $validated['cognitiveLevels']
            : [];
        $questionType = $validated['questionType'] ?? 'multiple_choice';
        $blockedQuestions = array_values(array_filter(array_map('strval', (array) ($validated['blockedQuestions'] ?? []))));
        $instructions = trim((string) ($validated['instructions'] ?? ''));
        $instructions = trim($instructions . "\nGenerează o întrebare nouă pentru același test. Nu repeta întrebările existente și păstrează tipul cerut.");

        try {
            $questions = $this->aiQuestionGeneration->generateReviewDraftQuestion(
                $source['content'],
                $difficulty,
                [$questionType],
                $instructions,
                [],
                $blockedQuestions,
                $cognitiveLevels
            );
        } catch (\Exception $e) {
            Log::error('Formely AI question regeneration failed', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => 'Eroare la regenerarea întrebării AI: ' . ($e->getMessage() ?: 'Problema AI'),
            ], 500);
        }

        if (empty($questions)) {
            return response()->json([
                'error' => 'Formely AI nu a putut genera o întrebare nouă pentru sursa selectată.',
            ], 422);
        }

        if ($source['source_type'] === 'document') {
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithDocumentMetadata(
                $questions,
                $source['document']['file_name'],
                $difficulty,
                $source['document']['type'] ?? null,
                $qualityMode,
                $cognitiveLevels
            );
        } else {
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithSourceMetadata(
                $questions,
                (int) $source['course_id'],
                $difficulty,
                $source['module_id'],
                $source['lesson_id'],
                $qualityMode,
                $cognitiveLevels
            );
        }

        return response()->json([
            'message' => 'Question regenerated successfully',
            'question' => $questions[0],
            'source_type' => $source['source_type'],
        ]);
    }

    /**
     * Create a test from reviewed Formely AI questions and optionally attach to course scope.
     */
    public function createFromCourse(Request $request)
    {
        $this->assertCompanyFeature('ai_test_generation');

        @set_time_limit(0);

        $validated = $request->validate([
            'source_type' => 'nullable|in:course,document',
            'course_id' => 'nullable|integer|exists:courses,id|required_if:source_type,course',
            'document' => 'nullable|array|required_if:source_type,document',
            'document.file_name' => 'nullable|string|max:255',
            'document.name' => 'nullable|string|max:255',
            'document.type' => 'nullable|string|max:50',
            'document.text' => 'nullable|string',
            'document.preview' => 'nullable|string',
            'scope' => 'nullable|in:course,module,lesson',
            'scope_id' => 'nullable|integer',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|in:practice,graded,final',
            'difficulty' => 'nullable|in:easy,medium,hard',
            'qualityMode' => 'nullable|in:fast,balanced,high_stakes',
            'cognitiveLevels' => 'nullable|array',
            'cognitiveLevels.*' => 'in:recall,understanding,application,analysis',
            'status' => 'nullable|in:draft,published',
            'time_limit_minutes' => 'nullable|integer|min:1',
            'max_attempts' => 'nullable|integer|min:1',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'randomize_questions' => 'nullable|boolean',
            'randomize_answers' => 'nullable|boolean',
            'show_results_immediately' => 'nullable|boolean',
            'show_correct_answers' => 'nullable|boolean',
            'allow_review' => 'nullable|boolean',
            'questions' => 'required|array|min:1',
            'questions.*.type' => 'required|string',
            'questions.*.content' => 'required|string',
            'questions.*.answers' => 'required|array',
            'save_to_question_bank' => 'nullable|boolean',
            'question_bank_title' => 'nullable|string|max:255',
            'attach' => 'nullable|boolean',
            'required' => 'nullable|boolean',
            'order' => 'nullable|integer|min:0',
            'unlock_after_previous' => 'nullable|boolean',
            'unlock_after_test_id' => 'nullable|exists:tests,id',
        ]);

        $creator = Auth::user();
        if (!$creator) {
            return response()->json(['message' => 'Trebuie să fii autentificat.'], 401);
        }

        $sourceType = $validated['source_type'] ?? 'course';
        $courseId = isset($validated['course_id']) ? (int) $validated['course_id'] : null;
        $course = null;
        if ($courseId) {
            $course = \App\Models\Course::findOrFail($courseId);
            if ($creator->isInstructor() && (int) $course->teacher_id !== (int) $creator->id) {
                abort(403, 'Poți crea teste doar din cursurile tale.');
            }
        } elseif ($sourceType === 'course') {
            return response()->json(['error' => 'Selectează un curs sursă.'], 422);
        }

        $scope = $validated['scope'] ?? 'course';
        [$moduleId, $lessonId] = $this->resolveCourseScopeIds($scope, $validated['scope_id'] ?? null);

        $questions = $validated['questions'];
        $difficulty = $validated['difficulty'] ?? 'medium';
        $qualityMode = $validated['qualityMode'] ?? 'balanced';
        $cognitiveLevels = is_array($validated['cognitiveLevels'] ?? null)
            ? $validated['cognitiveLevels']
            : [];

        if ($sourceType === 'document') {
            $document = is_array($validated['document'] ?? null) ? $validated['document'] : [];
            $fileName = trim((string) ($document['file_name'] ?? $document['name'] ?? 'Document'));
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithDocumentMetadata(
                $questions,
                $fileName,
                $difficulty,
                isset($document['type']) ? (string) $document['type'] : null,
                $qualityMode,
                $cognitiveLevels
            );
        } else {
            $questions = $this->aiQuestionGeneration->enrichQuestionsWithSourceMetadata(
                $questions,
                (int) $courseId,
                $difficulty,
                $moduleId,
                $lessonId,
                $qualityMode,
                $cognitiveLevels
            );
        }

        $testData = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'] ?? 'practice',
            'status' => $validated['status'] ?? 'draft',
            'time_limit_minutes' => $validated['time_limit_minutes'] ?? null,
            'max_attempts' => $validated['max_attempts'] ?? 1,
            'passing_score' => $validated['passing_score'] ?? 70,
            'randomize_questions' => $validated['randomize_questions'] ?? false,
            'randomize_answers' => $validated['randomize_answers'] ?? false,
            'show_results_immediately' => $validated['show_results_immediately'] ?? true,
            'show_correct_answers' => $validated['show_correct_answers'] ?? false,
            'allow_review' => $validated['allow_review'] ?? true,
            'question_source' => 'direct',
            'questions' => $questions,
        ];

        try {
            $test = $this->testBuilderService->createTest($testData, $creator);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Nu s-a putut crea testul: ' . $e->getMessage(),
            ], 422);
        }

        $shouldAttach = filter_var($validated['attach'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($shouldAttach && !$course) {
            return response()->json([
                'error' => 'Pentru atașare la curs trebuie selectat un curs destinație.',
            ], 422);
        }
        if ($shouldAttach) {
            $attachPayload = [
                'scope' => $scope,
                'scope_id' => $validated['scope_id'] ?? null,
                'required' => filter_var($validated['required'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'passing_score' => $validated['passing_score'] ?? 70,
                'order' => $validated['order'] ?? 0,
                'unlock_after_previous' => filter_var($validated['unlock_after_previous'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'unlock_after_test_id' => $validated['unlock_after_test_id'] ?? null,
            ];
            $this->courseBuilderService->attachTest($course, $test, $attachPayload);
        }

        $questionBank = null;
        $shouldSaveToBank = filter_var($validated['save_to_question_bank'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($shouldSaveToBank) {
            $bankTitle = trim((string) ($validated['question_bank_title'] ?? ''));
            if ($bankTitle === '') {
                $bankTitle = 'Întrebări Formely AI: ' . $validated['title'];
            }

            $questionBank = $this->testBuilderService->createQuestionBank([
                'title' => $bankTitle,
                'description' => 'Bancă generată automat din testul Formely AI „' . $validated['title'] . '”.',
                'status' => 'draft',
                'questions' => $questions,
            ], $creator);
        }

        ActivityLog::create([
            'user_id' => $creator->id,
            'action' => 'telemetry.admin_test_created_from_course',
            'model_type' => Test::class,
            'model_id' => $test->id,
            'description' => 'Telemetry event: admin_test_created_from_course',
            'new_values' => [
                'source_type' => $sourceType,
                'course_id' => $courseId,
                'scope' => $scope,
                'attached' => $shouldAttach,
                'question_bank_id' => $questionBank?->id,
                'questions_count' => count($questions),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Test created successfully',
            'test' => $test->load(['questions', 'creator']),
            'attached' => $shouldAttach,
            'question_bank' => $questionBank,
        ], 201);
    }

    /**
     * Resolve course or uploaded document content for AI test generation.
     *
     * @return array<string, mixed>
     */
    private function resolveAiSourceFromRequest(array $validated): array
    {
        $sourceType = $validated['source_type'] ?? 'course';

        if ($sourceType === 'document') {
            $document = is_array($validated['document'] ?? null) ? $validated['document'] : [];
            $fileName = trim((string) ($document['file_name'] ?? $document['name'] ?? 'Document'));
            $text = trim((string) ($document['text'] ?? $document['preview'] ?? ''));
            if (!$this->aiQuestionGeneration->documentHasExtractableContent($text)) {
                throw new \InvalidArgumentException('Fișierul nu conține suficient text pentru generarea testului (minimum ~80 caractere).');
            }

            $content = $this->aiQuestionGeneration->formatDocumentContent(
                $fileName,
                $text,
                isset($document['type']) ? (string) $document['type'] : null
            );

            $course = null;
            $courseId = isset($validated['course_id']) ? (int) $validated['course_id'] : null;
            if ($courseId) {
                $course = \App\Models\Course::findOrFail($courseId);
                if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
                    abort(403, 'Poți folosi doar cursurile tale ca destinație.');
                }
            }

            return [
                'source_type' => 'document',
                'content' => $content,
                'course' => $course,
                'course_id' => $courseId,
                'module_id' => null,
                'lesson_id' => null,
                'scope' => $validated['scope'] ?? 'course',
                'scope_id' => $validated['scope_id'] ?? null,
                'document' => [
                    'file_name' => $fileName,
                    'type' => $document['type'] ?? null,
                ],
                'source_label' => 'Fișier: ' . $fileName,
            ];
        }

        $courseId = (int) ($validated['course_id'] ?? 0);
        if ($courseId <= 0) {
            throw new \InvalidArgumentException('Selectează un curs sursă.');
        }

        $course = \App\Models\Course::findOrFail($courseId);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Poți genera teste doar din cursurile tale.');
        }

        $scope = $validated['scope'] ?? 'course';
        [$moduleId, $lessonId] = $this->resolveCourseScopeIds($scope, $validated['scope_id'] ?? null);
        $loadedCourse = $this->aiQuestionGeneration->loadCourseWithContentForAi($courseId);
        if (!$this->aiQuestionGeneration->courseHasExtractableContent($loadedCourse)) {
            throw new \InvalidArgumentException('Cursul selectat nu are conținut textual suficient pentru generarea testului.');
        }

        $content = $this->aiQuestionGeneration->extractCourseContent($loadedCourse, $moduleId, $lessonId);
        if (trim($content) === '') {
            throw new \InvalidArgumentException('Nu s-a putut extrage conținut pentru domeniul selectat.');
        }

        $modules = $loadedCourse->relationLoaded('modules') ? ($loadedCourse->modules ?? collect()) : collect();
        $rootLessons = $loadedCourse->relationLoaded('lessons') ? ($loadedCourse->lessons ?? collect()) : collect();
        $sourceLabel = 'Curs complet';
        if ($moduleId !== null) {
            $module = $modules->first(fn ($item) => (int) $item->id === $moduleId);
            $sourceLabel = $module ? 'Modul: ' . (string) $module->title : 'Modul #' . $moduleId;
        }
        if ($lessonId !== null) {
            $lesson = null;
            foreach ($modules as $module) {
                $lesson = ($module->lessons ?? collect())->first(fn ($item) => (int) $item->id === $lessonId);
                if ($lesson) {
                    break;
                }
            }
            $lesson ??= $rootLessons->first(fn ($item) => (int) $item->id === $lessonId);
            $sourceLabel = $lesson ? 'Lecție: ' . (string) $lesson->title : 'Lecție #' . $lessonId;
        }

        return [
            'source_type' => 'course',
            'content' => $content,
            'course' => $loadedCourse,
            'course_id' => $courseId,
            'module_id' => $moduleId,
            'lesson_id' => $lessonId,
            'scope' => $scope,
            'scope_id' => $validated['scope_id'] ?? null,
            'document' => null,
            'source_label' => $sourceLabel,
        ];
    }

    private function buildAiBlueprintFromText(
        string $content,
        string $sourceLabel,
        string $testType,
        ?\App\Models\Course $course = null,
        string $scope = 'course',
        $scopeId = null,
        ?int $moduleId = null,
        ?int $lessonId = null
    ): array {
        $plainText = trim(preg_replace('/\s+/u', ' ', strip_tags($content)) ?? '');
        $wordCount = $plainText !== '' ? count(preg_split('/\s+/u', $plainText) ?: []) : 0;
        $moduleCount = 0;
        $lessonCount = 0;

        if ($course) {
            $modules = $course->relationLoaded('modules') ? ($course->modules ?? collect()) : collect();
            $rootLessons = $course->relationLoaded('lessons') ? ($course->lessons ?? collect()) : collect();
            $moduleCount = $modules->count();
            $lessonCount = $modules->sum(fn ($module) => ($module->lessons ?? collect())->count()) + $rootLessons->count();

            if ($moduleId !== null) {
                $module = $modules->first(fn ($item) => (int) $item->id === $moduleId);
                $moduleCount = $module ? 1 : 0;
                $lessonCount = $module ? ($module->lessons ?? collect())->count() : 0;
            }
            if ($lessonId !== null) {
                $moduleCount = 0;
                $lessonCount = 1;
            }
        }

        if ($wordCount < 700) {
            $blueprint = [
                'numberOfQuestions' => 6,
                'difficulty' => 'easy',
                'qualityMode' => 'balanced',
                'questionTypes' => ['single_choice', 'true_false'],
                'cognitiveLevels' => ['recall', 'understanding'],
                'rationale' => 'Sursa este scurtă, deci Formely AI recomandă un test compact axat pe verificare directă și înțelegere.',
            ];
        } elseif ($wordCount < 2200) {
            $blueprint = [
                'numberOfQuestions' => 10,
                'difficulty' => 'medium',
                'qualityMode' => 'balanced',
                'questionTypes' => ['multiple_choice', 'single_choice', 'true_false', 'matching'],
                'cognitiveLevels' => ['understanding', 'application'],
                'rationale' => 'Sursa are suficient conținut pentru un mix echilibrat de înțelegere și aplicare.',
            ];
        } else {
            $blueprint = [
                'numberOfQuestions' => 15,
                'difficulty' => 'medium',
                'qualityMode' => 'high_stakes',
                'questionTypes' => ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'],
                'cognitiveLevels' => ['understanding', 'application', 'analysis'],
                'rationale' => 'Sursa este amplă, deci Formely AI recomandă varietate de tipuri și mai multe întrebări aplicative/analitice.',
            ];
        }

        if ($testType === 'final') {
            $blueprint['numberOfQuestions'] = max(12, (int) $blueprint['numberOfQuestions']);
            $blueprint['difficulty'] = $wordCount >= 1200 ? 'hard' : 'medium';
            $blueprint['qualityMode'] = 'high_stakes';
            $blueprint['cognitiveLevels'] = array_values(array_unique(array_merge($blueprint['cognitiveLevels'], ['analysis'])));
            $blueprint['rationale'] .= ' Pentru test final, recomandarea crește rigoarea și include analiză.';
        } elseif ($testType === 'graded') {
            $blueprint['numberOfQuestions'] = max(8, (int) $blueprint['numberOfQuestions']);
            $blueprint['qualityMode'] = $blueprint['qualityMode'] === 'fast' ? 'balanced' : $blueprint['qualityMode'];
            $blueprint['rationale'] .= ' Pentru test evaluativ, recomandarea evită modul rapid.';
        }

        return [
            ...$blueprint,
            'testType' => $testType,
            'scope' => $scope,
            'scope_id' => $scopeId,
            'source_label' => $sourceLabel,
            'source_word_count' => $wordCount,
            'source_modules_count' => $moduleCount,
            'source_lessons_count' => $lessonCount,
        ];
    }

    private function buildAiCoverageReportFromDocument(
        string $fileName,
        string $content,
        array $questions,
        int $requestedCount,
        array $requestedTypes,
        string $qualityMode,
        array $cognitiveLevels = []
    ): array {
        $plainText = trim(preg_replace('/\s+/u', ' ', strip_tags($content)) ?? '');
        $wordCount = $plainText !== '' ? count(preg_split('/\s+/u', $plainText) ?: []) : 0;
        $typeDistribution = [];
        foreach ($questions as $question) {
            $type = (string) ($question['type'] ?? 'multiple_choice');
            $typeDistribution[$type] = ($typeDistribution[$type] ?? 0) + 1;
        }
        $generatedCount = count($questions);

        return [
            'requested_count' => $requestedCount,
            'generated_count' => $generatedCount,
            'missing_count' => max(0, $requestedCount - $generatedCount),
            'target_met' => $generatedCount >= $requestedCount,
            'quality_mode' => $qualityMode,
            'cognitive_levels' => array_values($cognitiveLevels),
            'scope' => 'document',
            'scope_id' => null,
            'source_label' => 'Fișier: ' . $fileName,
            'source_modules_count' => 0,
            'source_lessons_count' => 0,
            'source_word_count' => $wordCount,
            'requested_types' => array_values($requestedTypes),
            'type_distribution' => $typeDistribution,
            'notes' => $generatedCount < $requestedCount
                ? 'Formely AI a returnat mai puține întrebări pentru a evita umplutura slabă.'
                : 'Ținta de întrebări a fost atinsă.',
        ];
    }

    /**
     * Resolve module/lesson IDs from attach scope.
     *
     * @return array{0: ?int, 1: ?int}
     */
    private function buildAiBlueprintSuggestion(
        \App\Models\Course $course,
        string $courseContent,
        string $scope,
        $scopeId,
        ?int $moduleId,
        ?int $lessonId,
        string $testType
    ): array {
        $plainText = trim(preg_replace('/\s+/u', ' ', strip_tags($courseContent)) ?? '');
        $wordCount = $plainText !== '' ? count(preg_split('/\s+/u', $plainText) ?: []) : 0;
        $modules = $course->relationLoaded('modules') ? ($course->modules ?? collect()) : collect();
        $rootLessons = $course->relationLoaded('lessons') ? ($course->lessons ?? collect()) : collect();
        $lessonCount = $modules->sum(fn ($module) => ($module->lessons ?? collect())->count()) + $rootLessons->count();
        $moduleCount = $modules->count();
        $sourceLabel = 'Curs complet';

        if ($moduleId !== null) {
            $module = $modules->first(fn ($item) => (int) $item->id === $moduleId);
            $sourceLabel = $module ? 'Modul: ' . (string) $module->title : 'Modul #' . $moduleId;
            $moduleCount = $module ? 1 : 0;
            $lessonCount = $module ? ($module->lessons ?? collect())->count() : 0;
        }

        if ($lessonId !== null) {
            $lesson = null;
            foreach ($modules as $module) {
                $lesson = ($module->lessons ?? collect())->first(fn ($item) => (int) $item->id === $lessonId);
                if ($lesson) {
                    break;
                }
            }
            $lesson ??= $rootLessons->first(fn ($item) => (int) $item->id === $lessonId);
            $sourceLabel = $lesson ? 'Lecție: ' . (string) $lesson->title : 'Lecție #' . $lessonId;
            $moduleCount = 0;
            $lessonCount = $lesson ? 1 : 0;
        }

        if ($wordCount < 700) {
            $blueprint = [
                'numberOfQuestions' => 6,
                'difficulty' => 'easy',
                'qualityMode' => 'balanced',
                'questionTypes' => ['single_choice', 'true_false'],
                'cognitiveLevels' => ['recall', 'understanding'],
                'rationale' => 'Sursa este scurtă, deci Formely AI recomandă un test compact axat pe verificare directă și înțelegere.',
            ];
        } elseif ($wordCount < 2200) {
            $blueprint = [
                'numberOfQuestions' => 10,
                'difficulty' => 'medium',
                'qualityMode' => 'balanced',
                'questionTypes' => ['multiple_choice', 'single_choice', 'true_false', 'matching'],
                'cognitiveLevels' => ['understanding', 'application'],
                'rationale' => 'Sursa are suficient conținut pentru un mix echilibrat de înțelegere și aplicare.',
            ];
        } else {
            $blueprint = [
                'numberOfQuestions' => 15,
                'difficulty' => 'medium',
                'qualityMode' => 'high_stakes',
                'questionTypes' => ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'],
                'cognitiveLevels' => ['understanding', 'application', 'analysis'],
                'rationale' => 'Sursa este amplă, deci Formely AI recomandă varietate de tipuri și mai multe întrebări aplicative/analitice.',
            ];
        }

        if ($testType === 'final') {
            $blueprint['numberOfQuestions'] = max(12, (int) $blueprint['numberOfQuestions']);
            $blueprint['difficulty'] = $wordCount >= 1200 ? 'hard' : 'medium';
            $blueprint['qualityMode'] = 'high_stakes';
            $blueprint['cognitiveLevels'] = array_values(array_unique(array_merge($blueprint['cognitiveLevels'], ['analysis'])));
            $blueprint['rationale'] .= ' Pentru test final, recomandarea crește rigoarea și include analiză.';
        } elseif ($testType === 'graded') {
            $blueprint['numberOfQuestions'] = max(8, (int) $blueprint['numberOfQuestions']);
            $blueprint['qualityMode'] = $blueprint['qualityMode'] === 'fast' ? 'balanced' : $blueprint['qualityMode'];
            $blueprint['rationale'] .= ' Pentru test evaluativ, recomandarea evită modul rapid.';
        }

        return [
            ...$blueprint,
            'testType' => $testType,
            'scope' => $scope,
            'scope_id' => $scopeId,
            'source_label' => $sourceLabel,
            'source_word_count' => $wordCount,
            'source_modules_count' => $moduleCount,
            'source_lessons_count' => $lessonCount,
        ];
    }

    private function buildAiCoverageReport(
        \App\Models\Course $course,
        array $questions,
        int $requestedCount,
        array $requestedTypes,
        string $scope,
        $scopeId,
        ?int $moduleId,
        ?int $lessonId,
        string $qualityMode,
        array $cognitiveLevels = []
    ): array {
        $modules = $course->relationLoaded('modules') ? ($course->modules ?? collect()) : collect();
        $rootLessons = $course->relationLoaded('lessons') ? ($course->lessons ?? collect()) : collect();

        $sourceLabel = 'Curs complet';
        $moduleCount = $modules->count();
        $lessonCount = $modules->sum(fn ($module) => ($module->lessons ?? collect())->count())
            + $rootLessons->count();

        if ($moduleId !== null) {
            $module = $modules->first(fn ($item) => (int) $item->id === $moduleId);
            $sourceLabel = $module ? 'Modul: ' . (string) $module->title : 'Modul #' . $moduleId;
            $moduleCount = $module ? 1 : 0;
            $lessonCount = $module ? ($module->lessons ?? collect())->count() : 0;
        }

        if ($lessonId !== null) {
            $lesson = null;
            foreach ($modules as $module) {
                $lesson = ($module->lessons ?? collect())->first(fn ($item) => (int) $item->id === $lessonId);
                if ($lesson) {
                    break;
                }
            }
            $lesson ??= $rootLessons->first(fn ($item) => (int) $item->id === $lessonId);
            $sourceLabel = $lesson ? 'Lecție: ' . (string) $lesson->title : 'Lecție #' . $lessonId;
            $moduleCount = 0;
            $lessonCount = $lesson ? 1 : 0;
        }

        $typeDistribution = [];
        foreach ($questions as $question) {
            $type = (string) ($question['type'] ?? 'multiple_choice');
            $typeDistribution[$type] = ($typeDistribution[$type] ?? 0) + 1;
        }

        $generatedCount = count($questions);

        return [
            'requested_count' => $requestedCount,
            'generated_count' => $generatedCount,
            'missing_count' => max(0, $requestedCount - $generatedCount),
            'target_met' => $generatedCount >= $requestedCount,
            'quality_mode' => $qualityMode,
            'cognitive_levels' => array_values($cognitiveLevels),
            'scope' => $scope,
            'scope_id' => $scopeId,
            'source_label' => $sourceLabel,
            'source_modules_count' => $moduleCount,
            'source_lessons_count' => $lessonCount,
            'requested_types' => array_values($requestedTypes),
            'type_distribution' => $typeDistribution,
            'notes' => $generatedCount < $requestedCount
                ? 'Formely AI a returnat mai puține întrebări pentru a evita umplutura slabă.'
                : 'Ținta de întrebări a fost atinsă.',
        ];
    }

    private function resolveCourseScopeIds(string $scope, $scopeId): array
    {
        $scopeId = $scopeId !== null && $scopeId !== '' ? (int) $scopeId : null;
        if ($scope === 'module') {
            return [$scopeId, null];
        }
        if ($scope === 'lesson') {
            return [null, $scopeId];
        }

        return [null, null];
    }

    public function suggestManualReviewFeedback(Request $request, $resultId)
    {
        $this->assertCompanyFeature('ai_test_generation');

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

}
