<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Test;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\TestResult;
use App\Models\ActivityLog;
use App\Services\TestBuilderService;
use App\Services\TestQuestionSelectionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

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

    public function __construct(TestBuilderService $testBuilderService, TestQuestionSelectionService $questionSelectionService)
    {
        $this->testBuilderService = $testBuilderService;
        $this->questionSelectionService = $questionSelectionService;
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
        $manualTypes = [];
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

            $manualTypes = [];
            if (!in_array($question->type ?? '', $manualTypes, true)) {
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
}
