<?php

namespace App\Http\Controllers\Api;

use App\Models\ExamResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Student-facing results for standalone catalog exams (ExamResult only).
 * Does not modify Exam models/controllers; separate from /exam-results (TestResult).
 */
class CatalogExamResultController extends ExamResultController
{
    public function index(Request $request)
    {
        try {
            if (! Schema::hasTable('exam_results')) {
                return response()->json([]);
            }

            $user = Auth::user();

            $rows = ExamResult::with(['exam:id,title,description,status,course_id,passing_score'])
                ->where('user_id', $user->id)
                ->whereHas('exam', function ($query) {
                    $query->whereNull('course_id');
                })
                ->get()
                ->map(function (ExamResult $result) {
                    $exam = $result->exam;

                    return [
                        'id' => $result->id,
                        'type' => 'exam',
                        'exam_id' => $result->exam_id,
                        'test_id' => null,
                        'course_id' => null,
                        'user_id' => $result->user_id,
                        'attempt_number' => $result->resolvedAttemptNumber(),
                        'score' => $result->score,
                        'max_score' => $result->total_points,
                        'total_points' => $result->total_points,
                        'percentage' => $result->percentage,
                        'passed' => $result->passed,
                        'answers' => $result->answers,
                        'completed_at' => $result->completed_at,
                        'needs_manual_review' => (bool) ($result->needs_manual_review ?? false),
                        'reviewed_at' => $result->reviewed_at,
                        'status' => $result->reviewed_at
                            ? 'approved'
                            : (($result->needs_manual_review ?? false) ? 'pending_review' : 'completed'),
                        'test' => null,
                        'exam' => $exam ? [
                            'id' => $exam->id,
                            'title' => $exam->title,
                            'course' => null,
                        ] : null,
                    ];
                })
                ->sort(function ($a, $b) {
                    $dateA = isset($a['completed_at']) ? strtotime((string) $a['completed_at']) : 0;
                    $dateB = isset($b['completed_at']) ? strtotime((string) $b['completed_at']) : 0;
                    if ($dateA === $dateB) {
                        return ($b['attempt_number'] ?? 0) <=> ($a['attempt_number'] ?? 0);
                    }

                    return $dateB <=> $dateA;
                })
                ->values();

            return response()->json($rows);
        } catch (\Throwable $e) {
            Log::error('Error fetching catalog exam results', [
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Nu s-au putut încărca rezultatele examenelor',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(Request $request, $id)
    {
        try {
            if (! Schema::hasTable('exam_results')) {
                return response()->json(['error' => 'Rezultatul nu a fost găsit'], 404);
            }

            $user = Auth::user();

            $examResult = ExamResult::with([
                'exam' => function ($query) {
                    $query->whereNull('course_id');
                },
                'exam.questions' => function ($query) {
                    $query->orderBy('order');
                },
                'exam.questions.answers',
            ])
                ->where('user_id', $user->id)
                ->find($id);

            if (! $examResult || ! $examResult->exam) {
                return response()->json(['error' => 'Rezultatul nu a fost găsit'], 404);
            }

            $userAnswers = $examResult->answers ?? [];
            if (! is_array($userAnswers)) {
                $userAnswers = [];
            }

            $questions = $examResult->exam->questions ?? collect();

            return response()->json([
                'id' => $examResult->id,
                'type' => 'exam',
                'exam_id' => $examResult->exam_id,
                'test_id' => null,
                'course_id' => null,
                'user_id' => $examResult->user_id,
                'attempt_number' => $examResult->resolvedAttemptNumber(),
                'score' => $examResult->score,
                'max_score' => $examResult->total_points,
                'total_points' => $examResult->total_points,
                'percentage' => $examResult->percentage,
                'passed' => $examResult->passed,
                'correct_answers_count' => null,
                'total_questions' => $questions->count(),
                'answers' => $userAnswers,
                'completed_at' => $examResult->completed_at,
                'needs_manual_review' => (bool) ($examResult->needs_manual_review ?? false),
                'manual_review_scores' => is_array($examResult->manual_review_scores) ? $examResult->manual_review_scores : null,
                'reviewed_at' => $examResult->reviewed_at,
                'status' => $examResult->reviewed_at
                    ? 'approved'
                    : (($examResult->needs_manual_review ?? false) ? 'pending_review' : 'completed'),
                'test' => null,
                'exam' => [
                    'id' => $examResult->exam->id,
                    'title' => $examResult->exam->title,
                    'description' => $examResult->exam->description,
                    'status' => $examResult->exam->status,
                    'course' => null,
                    'questions' => $questions->map(function ($question) use ($userAnswers, $examResult) {
                        return $this->buildLegacyExamQuestionResultWire($examResult, $question, $userAnswers);
                    })->values(),
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error('Error fetching catalog exam result', [
                'result_id' => $id,
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Nu s-a putut încărca rezultatul',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
