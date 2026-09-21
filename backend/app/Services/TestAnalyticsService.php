<?php

namespace App\Services;

use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use Illuminate\Support\Collection;

/**
 * Statistici test: rezumat, analiză pe întrebări (item analysis), detaliu per încercare.
 */
class TestAnalyticsService
{
    public function __construct(
        protected TestQuestionSelectionService $questionSelection,
        protected TestAttemptAnswerOrderService $answerOrder,
    ) {
    }

    public function loadResults(Test $test): Collection
    {
        return TestResult::with(['user:id,name,email', 'test'])
            ->where('test_id', $test->id)
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->get();
    }

    public function buildSummary(Test $test, Collection $results): array
    {
        $attempts = $results->count();
        $uniqueStudents = $results->pluck('user_id')->filter()->unique()->count();
        $percentages = $results->map(fn ($r) => (float) ($r->percentage ?? 0))->filter(fn ($v) => $v >= 0);

        return [
            'attempts_count' => $attempts,
            'unique_students' => $uniqueStudents,
            'pass_count' => $results->where('passed', true)->count(),
            'fail_count' => $results->where('passed', false)->count(),
            'pending_review_count' => $results->filter(fn ($r) => (bool) ($r->needs_manual_review ?? false) || $r->status === 'pending_review')->count(),
            'average_percentage' => $percentages->count() ? round($percentages->avg(), 2) : null,
            'high_percentage' => $percentages->count() ? round($percentages->max(), 2) : null,
            'low_percentage' => $percentages->count() ? round($percentages->min(), 2) : null,
            'average_score' => $attempts ? round($results->avg(fn ($r) => (float) ($r->score ?? 0)), 2) : null,
            'passing_score' => $this->resolvePassingScore($test),
        ];
    }

    public function buildQuestionAnalytics(Test $test, Collection $results): array
    {
        $questionMap = $this->collectQuestionsForAnalytics($test, $results);
        $discriminationGroups = $this->buildDiscriminationGroups($results);

        return $questionMap->sortBy('order')->values()->map(function (Question $question) use ($test, $results, $discriminationGroups) {
            $type = (string) ($question->type ?? 'multiple_choice');
            $isChoice = in_array($type, ['multiple_choice', 'single_choice', 'true_false'], true);
            $presentedCount = 0;
            $answeredCount = 0;
            $skippedCount = 0;
            $correctCount = 0;
            $topCorrect = 0;
            $topTotal = 0;
            $bottomCorrect = 0;
            $bottomTotal = 0;
            $optionStats = [];
            $pointsEarned = [];

            if ($isChoice) {
                $answers = is_array($question->answers) ? array_values($question->answers) : [];
                foreach ($answers as $idx => $answer) {
                    $optionStats[$idx] = [
                        'index' => $idx,
                        'text' => $this->answerOrder->answerText($answer),
                        'count' => 0,
                        'percentage' => 0,
                        'is_correct' => in_array($idx, $this->answerOrder->correctIndicesForAnswers($answers, $type), true),
                    ];
                }
            }

            foreach ($results as $result) {
                if (! $result->test) {
                    $result->setRelation('test', $test);
                }

                $attemptQuestions = $this->questionSelection->selectForAttempt(
                    $test,
                    (int) $result->user_id,
                    (int) ($result->attempt_number ?? 1)
                );

                if (! $attemptQuestions->contains('id', $question->id)) {
                    continue;
                }

                $presentedCount++;
                $graded = $this->gradeQuestion($result, $question);
                $hasAnswer = (bool) ($graded['has_answer'] ?? false);

                if ($hasAnswer) {
                    $answeredCount++;
                } else {
                    $skippedCount++;
                }

                if ($graded['is_correct'] === true) {
                    $correctCount++;
                }

                $resultId = (int) $result->id;
                if (isset($discriminationGroups['top_ids'][$resultId]) && $graded['is_correct'] !== null) {
                    $topTotal++;
                    if ($graded['is_correct'] === true) {
                        $topCorrect++;
                    }
                }
                if (isset($discriminationGroups['bottom_ids'][$resultId]) && $graded['is_correct'] !== null) {
                    $bottomTotal++;
                    if ($graded['is_correct'] === true) {
                        $bottomCorrect++;
                    }
                }

                if (isset($graded['points_earned'])) {
                    $pointsEarned[] = (float) $graded['points_earned'];
                }

                if ($isChoice && is_array($graded['selected_display_indices'] ?? null)) {
                    foreach ($graded['selected_display_indices'] as $displayIndex) {
                        if (array_key_exists($displayIndex, $optionStats)) {
                            $optionStats[$displayIndex]['count']++;
                        }
                    }
                }
            }

            $base = max(1, $presentedCount);
            foreach ($optionStats as &$stat) {
                $stat['percentage'] = round(($stat['count'] / $base) * 100, 2);
            }
            unset($stat);

            $difficulty = $isChoice ? round(($correctCount / $base) * 100, 2) : null;
            $pTop = $topTotal > 0 ? $topCorrect / $topTotal : null;
            $pBottom = $bottomTotal > 0 ? $bottomCorrect / $bottomTotal : null;
            $discriminationIndex = ($pTop !== null && $pBottom !== null)
                ? round($pTop - $pBottom, 3)
                : null;

            return [
                'question_id' => $question->id,
                'question_text' => $question->content ?? '',
                'question_type' => $type,
                'points' => (int) ($question->points ?? 1),
                'order' => (int) ($question->order ?? 0),
                'presented_count' => $presentedCount,
                'attempts' => $presentedCount,
                'answered_count' => $answeredCount,
                'skipped_count' => $skippedCount,
                'correct_count' => $isChoice ? $correctCount : null,
                'correct_rate' => $difficulty,
                'difficulty_index' => $difficulty !== null ? round($difficulty / 100, 3) : null,
                'discrimination_index' => $discriminationIndex,
                'discrimination_group_size' => $discriminationGroups['group_size'],
                'average_points_earned' => count($pointsEarned) ? round(array_sum($pointsEarned) / count($pointsEarned), 2) : null,
                'option_stats' => array_values($optionStats),
            ];
        })->values()->all();
    }

    protected function resolvePassingScore(Test $test): int
    {
        $courseTest = \App\Models\CourseTest::where('test_id', $test->id)->first();

        return $courseTest
            ? (int) ($courseTest->passing_score ?? $test->passing_score ?? 70)
            : (int) ($test->passing_score ?? 70);
    }

    /**
     * Top/bottom 27% groups for discrimination index (Moodle / classical test theory).
     *
     * @return array{top_ids: array<int, int>, bottom_ids: array<int, int>, group_size: int}
     */
    protected function buildDiscriminationGroups(Collection $results): array
    {
        $sorted = $results
            ->sortByDesc(fn ($r) => (float) ($r->percentage ?? 0))
            ->values();

        $count = $sorted->count();
        if ($count < 4) {
            return ['top_ids' => [], 'bottom_ids' => [], 'group_size' => 0];
        }

        $groupSize = max(1, (int) ceil($count * 0.27));
        $topIds = [];
        foreach ($sorted->take($groupSize) as $row) {
            $topIds[(int) $row->id] = 1;
        }

        $bottomIds = [];
        foreach ($sorted->slice($count - $groupSize) as $row) {
            $bottomIds[(int) $row->id] = 1;
        }

        return [
            'top_ids' => $topIds,
            'bottom_ids' => $bottomIds,
            'group_size' => $groupSize,
        ];
    }

    public function buildAttemptBreakdown(TestResult $result): array
    {
        $test = $result->test ?? Test::find($result->test_id);
        if (! $test) {
            return [];
        }
        $result->setRelation('test', $test);

        $questions = $this->questionSelection->selectForAttempt(
            $test,
            (int) $result->user_id,
            (int) ($result->attempt_number ?? 1)
        );

        return $questions->sortBy('order')->values()->map(function (Question $question) use ($result) {
            $graded = $this->gradeQuestion($result, $question);

            return [
                'question_id' => $question->id,
                'question_text' => $question->content ?? '',
                'question_type' => $question->type ?? 'multiple_choice',
                'points' => (int) ($question->points ?? 1),
                'points_earned' => $graded['points_earned'] ?? 0,
                'is_correct' => $graded['is_correct'],
                'has_answer' => $graded['has_answer'] ?? false,
                'user_answer_summary' => $graded['user_answer_summary'] ?? null,
                'selected_option_indices' => $graded['selected_display_indices'] ?? [],
            ];
        })->all();
    }

    protected function collectQuestionsForAnalytics(Test $test, Collection $results): Collection
    {
        $byId = collect();

        if ($test->question_source === 'bank' && $test->relationLoaded('questionBank') && $test->questionBank?->questions) {
            foreach ($test->questionBank->questions as $question) {
                $byId->put($question->id, $question);
            }
        } elseif ($test->relationLoaded('questions')) {
            foreach ($test->questions as $question) {
                $byId->put($question->id, $question);
            }
        } else {
            $test->load(['questions', 'questionBank.questions']);
            foreach ($test->questions as $question) {
                $byId->put($question->id, $question);
            }
            if ($test->questionBank?->questions) {
                foreach ($test->questionBank->questions as $question) {
                    $byId->put($question->id, $question);
                }
            }
        }

        foreach ($results as $result) {
            $answers = is_array($result->answers) ? $result->answers : [];
            foreach (array_keys($answers) as $qid) {
                if ($byId->has($qid)) {
                    continue;
                }
                $question = Question::find($qid);
                if ($question) {
                    $byId->put($question->id, $question);
                }
            }
        }

        return $byId;
    }

    protected function gradeQuestion(TestResult $result, Question $question): array
    {
        $test = $result->test;
        $answers = is_array($result->answers) ? $result->answers : [];
        $userAnswer = $answers[$question->id] ?? $answers[(string) $question->id] ?? null;
        $type = (string) ($question->type ?? 'multiple_choice');
        $points = (int) ($question->points ?? 1);
        $hasAnswer = ! ($userAnswer === null || $userAnswer === '' || (is_array($userAnswer) && count($userAnswer) === 0));
        $attemptNumber = (int) ($result->attempt_number ?? 1);

        $isCorrect = null;
        $pointsEarned = 0;
        $userAnswerSummary = null;
        $selectedDisplayIndices = [];

        if (in_array($type, ['multiple_choice', 'single_choice', 'true_false'], true)) {
            $order = $this->answerOrder->resolveChoiceOrderForAttempt($test, $question, (int) $result->user_id, $attemptNumber);
            $originalSelected = $this->answerOrder->selectedOriginalIndicesFromStored($userAnswer, $type, $order);
            $selectedDisplayIndices = $this->answerOrder->originalIndicesToDisplay($originalSelected, $order['original_to_display']);
            $isCorrect = $hasAnswer && $this->answerOrder->gradeChoiceInOriginalSpace($type, $originalSelected, $order['correct_original_indices']);
            $pointsEarned = $isCorrect ? $points : 0;

            $labels = [];
            foreach ($selectedDisplayIndices as $displayIndex) {
                $answer = $order['display_answers'][$displayIndex] ?? null;
                if ($answer !== null) {
                    $labels[] = $this->answerOrder->answerText($answer);
                }
            }
            $userAnswerSummary = $labels ? implode('; ', $labels) : null;
        } elseif ($type === 'matching') {
            $matching = $this->buildMatchingQuestionData($question, $test, (int) $result->user_id, $attemptNumber);
            $isCorrect = $hasAnswer && $this->isSequenceAnswerCorrect($userAnswer, $matching['correctMap'] ?? []);
            $pointsEarned = $isCorrect ? $points : 0;
            $userAnswerSummary = $hasAnswer ? 'Potrivire trimisă' : null;
        } elseif ($type === 'ordering') {
            $ordering = $this->buildOrderingQuestionData($question, $test, (int) $result->user_id, $attemptNumber);
            $isCorrect = $hasAnswer && $this->isSequenceAnswerCorrect($userAnswer, $ordering['correctOrder'] ?? []);
            $pointsEarned = $isCorrect ? $points : 0;
            $userAnswerSummary = $hasAnswer ? 'Ordine trimisă' : null;
        }

        return [
            'has_answer' => $hasAnswer,
            'is_correct' => $isCorrect,
            'points_earned' => $pointsEarned,
            'user_answer_summary' => $userAnswerSummary,
            'selected_display_indices' => $selectedDisplayIndices,
        ];
    }

    protected function isSequenceAnswerCorrect(mixed $userAnswer, array $correctSequence): bool
    {
        $normalized = $this->normalizeSequenceAnswer($userAnswer);
        if ($normalized === null) {
            return false;
        }

        return $normalized === array_values(array_map('strval', $correctSequence));
    }

    protected function normalizeSequenceAnswer(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }

        return array_values(array_map(static function ($item) {
            if (is_scalar($item) || $item === null) {
                return (string) $item;
            }

            return json_encode($item);
        }, $value));
    }

    protected function buildMatchingQuestionData(Question $question, Test $test, int $userId, int $attemptNumber): array
    {
        $metadata = is_array($question->metadata) ? $question->metadata : [];
        $pairs = is_array($metadata['pairs'] ?? null) ? array_values($metadata['pairs']) : [];
        if ($pairs === []) {
            $answers = is_array($question->answers) ? array_values($question->answers) : [];
            foreach ($answers as $answer) {
                if (! is_array($answer)) {
                    continue;
                }
                if (array_key_exists('left', $answer) || array_key_exists('right', $answer)) {
                    $pairs[] = $answer;
                }
            }
        }

        $rightItems = [];
        foreach ($pairs as $index => $pair) {
            if (! is_array($pair)) {
                continue;
            }
            $leftText = trim((string) ($pair['left'] ?? $pair['question'] ?? $pair['text'] ?? ''));
            $rightText = trim((string) ($pair['right'] ?? $pair['answer'] ?? $pair['answer_text'] ?? ''));
            if ($leftText === '' || $rightText === '') {
                continue;
            }
            $rightItems[] = ['id' => (string) $index, 'text' => $rightText];
        }

        return [
            'correctMap' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $rightItems)),
        ];
    }

    protected function buildOrderingQuestionData(Question $question, Test $test, int $userId, int $attemptNumber): array
    {
        $metadata = is_array($question->metadata) ? $question->metadata : [];
        $items = is_array($metadata['items'] ?? null) ? array_values($metadata['items']) : [];
        if ($items === []) {
            $answers = is_array($question->answers) ? array_values($question->answers) : [];
            foreach ($answers as $answer) {
                if (is_array($answer)) {
                    $text = trim((string) ($answer['text'] ?? $answer['answer_text'] ?? ''));
                    if ($text !== '') {
                        $items[] = $text;
                    }
                } elseif (is_scalar($answer)) {
                    $text = trim((string) $answer);
                    if ($text !== '') {
                        $items[] = $text;
                    }
                }
            }
        }

        $normalized = [];
        foreach ($items as $index => $item) {
            $text = is_array($item) ? (string) ($item['text'] ?? $item['label'] ?? '') : (string) $item;
            if (trim($text) === '') {
                continue;
            }
            $normalized[] = ['id' => (string) $index, 'text' => $text];
        }

        return [
            'correctOrder' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $normalized)),
        ];
    }
}
