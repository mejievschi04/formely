<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExamResult;
use App\Models\Test;
use App\Models\TestResult;
use App\Services\TestAttemptAnswerOrderService;
use App\Services\TestAttemptService;
use App\Services\TestQuestionSelectionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Support\SchemaCache;

class ExamResultController extends Controller
{
    protected TestQuestionSelectionService $questionSelectionService;
    protected TestAttemptAnswerOrderService $answerOrderService;
    protected TestAttemptService $attemptService;

    public function __construct(
        TestQuestionSelectionService $questionSelectionService,
        TestAttemptAnswerOrderService $answerOrderService,
        TestAttemptService $attemptService
    ) {
        $this->questionSelectionService = $questionSelectionService;
        $this->answerOrderService = $answerOrderService;
        $this->attemptService = $attemptService;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    protected function latestResultRows($rows): array
    {
        $byTest = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $key = ! empty($row['test_id'])
                ? 'test:'.$row['test_id']
                : (! empty($row['exam_id']) ? 'exam:'.$row['exam_id'] : (($row['type'] ?? 'exam').':'.$row['id']));
            $current = $byTest[$key] ?? null;
            if ($current === null) {
                $byTest[$key] = $row;
                continue;
            }
            $currentTime = isset($current['completed_at']) ? strtotime((string) $current['completed_at']) : 0;
            $nextTime = isset($row['completed_at']) ? strtotime((string) $row['completed_at']) : 0;
            $currentAttempt = (int) ($current['attempt_number'] ?? 0);
            $nextAttempt = (int) ($row['attempt_number'] ?? 0);
            if ($nextTime > $currentTime || ($nextTime === $currentTime && $nextAttempt > $currentAttempt)) {
                $byTest[$key] = $row;
            }
        }

        return array_values($byTest);
    }

    protected function resultCard(array $row): array
    {
        $type = (string) ($row['type'] ?? 'test');
        $detailRequest = Request::create('/api/exam-results/'.$row['id'].'?type='.urlencode($type), 'GET');
        $response = $this->show($detailRequest, $row['id']);
        $payload = $response->getData(true);
        if ($response->getStatusCode() !== 200 || ! is_array($payload) || isset($payload['error'])) {
            return $row;
        }

        return $payload;
    }

    protected function coursePayloadFromTestResult(TestResult $result): ?array
    {
        $course = $result->course ?? null;

        if (!$course && $result->test && $result->test->courses) {
            $course = $result->test->courses->first();
        }

        return $course ? [
            'id' => $course->id,
            'title' => $course->title,
        ] : null;
    }

    protected function normalizeAnswerIndex($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        return null;
    }

    protected function shouldShowOnlySubmittedAnswers(?Test $test = null, ?array $examSettings = null): bool
    {
        if ($test && (bool) ($test->show_only_submitted_answers ?? false)) {
            return true;
        }

        return (bool) ($examSettings['show_only_submitted_answers'] ?? false);
    }

    protected function sanitizeQuestionWireForSubmittedOnly(array $wire): array
    {
        return $this->hideUnrevealedSolutionKeys($wire);
    }

    protected function hideUnrevealedSolutionKeys(array $wire): array
    {
        unset(
            $wire['correct_answer_index'],
            $wire['correct_answer_indices'],
            $wire['answerIndex'],
            $wire['answerIndices'],
            $wire['explanation']
        );

        if (isset($wire['answers']) && is_array($wire['answers'])) {
            $wire['answers'] = array_map(function ($answer) {
                if (! is_array($answer)) {
                    return $answer;
                }
                if (! ($answer['is_selected'] ?? false)) {
                    unset($answer['is_correct']);
                }

                return $answer;
            }, $wire['answers']);
        }

        if (isset($wire['matching']) && is_array($wire['matching'])) {
            unset($wire['matching']['correctMap']);
        }
        if (isset($wire['ordering']) && is_array($wire['ordering'])) {
            unset($wire['ordering']['correctOrder']);
        }

        return $wire;
    }

    protected function normalizeArrayLike(mixed $value): ?array
    {
        if ($value instanceof \Illuminate\Support\Collection) {
            return $value->all();
        }

        if (is_array($value)) {
            return $value;
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    protected function normalizedSequenceValue(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }

        return array_values(array_map(static function ($item) {
            if (is_scalar($item) || $item === null) {
                return (string) $item;
            }

            return json_encode($item);
        }, $value));
    }

    protected function isSequenceAnswerCorrect(mixed $userAnswer, array $correctSequence): bool
    {
        $normalized = $this->normalizedSequenceValue($userAnswer);
        if ($normalized === null) {
            return false;
        }

        return $normalized === array_values(array_map('strval', $correctSequence));
    }

    protected function shuffleBySeed(array $items, string $seedBase): array
    {
        $indexed = [];
        foreach ($items as $idx => $item) {
            $label = is_array($item)
                ? (string) ($item['text'] ?? $item['answer_text'] ?? $item['content'] ?? $item['label'] ?? $item['left'] ?? $item['right'] ?? '')
                : (string) $item;
            $indexed[] = [
                'key' => hash('sha1', $seedBase . ":{$idx}:{$label}"),
                'item' => $item,
            ];
        }

        usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);

        return array_values(array_map(fn ($entry) => $entry['item'], $indexed));
    }

    /**
     * @return int[]
     */
    protected function resolveCorrectAnswerIndices(array $answers, string $type): array
    {
        if (! in_array($type, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            return [];
        }

        $indices = [];
        foreach ($answers as $idx => $answer) {
            if ($this->isAnswerCorrectFlag($answer)) {
                $indices[] = (int) $idx;
            }
        }

        if ($type === 'single_choice' || $type === 'true_false' || $type === 'yes_no') {
            return $indices !== [] ? [$indices[0]] : [];
        }

        return array_values(array_unique($indices));
    }

    /**
     * @return int[]
     */
    protected function resolveSelectedAnswerIndices(mixed $userAnswer, array $answers): array
    {
        if ($userAnswer === null || $userAnswer === '') {
            return [];
        }

        if (is_array($userAnswer)) {
            if (array_is_list($userAnswer)) {
                $indices = [];
                foreach ($userAnswer as $item) {
                    if (is_numeric($item) && array_key_exists((int) $item, $answers)) {
                        $indices[] = (int) $item;
                    }
                }

                return array_values(array_unique($indices));
            }

            foreach (['indices', 'selectedIndices', 'selected_indices', 'answers'] as $key) {
                if (isset($userAnswer[$key]) && is_array($userAnswer[$key])) {
                    return $this->resolveSelectedAnswerIndices($userAnswer[$key], $answers);
                }
            }

            $single = $this->resolveSelectedAnswerIndex($userAnswer, $answers);

            return $single !== null ? [$single] : [];
        }

        if (is_numeric($userAnswer) && array_key_exists((int) $userAnswer, $answers)) {
            return [(int) $userAnswer];
        }

        $single = $this->resolveSelectedAnswerIndex($userAnswer, $answers);

        return $single !== null ? [$single] : [];
    }

    protected function gradeChoiceQuestion(string $questionType, array $correctIndices, mixed $userAnswer, array $answers): bool
    {
        $correctIndices = array_values(array_unique(array_map('intval', $correctIndices)));
        sort($correctIndices);

        if ($questionType === 'multiple_choice') {
            $selected = $this->resolveSelectedAnswerIndices($userAnswer, $answers);
            sort($selected);

            return $correctIndices !== [] && $selected === $correctIndices;
        }

        $selectedIndex = $this->resolveSelectedAnswerIndex($userAnswer, $answers);
        if ($selectedIndex === null || $correctIndices === []) {
            return false;
        }

        return $selectedIndex === $correctIndices[0];
    }

    protected function isAnswerCorrectFlag($answer): bool
    {
        if (!is_array($answer)) {
            return false;
        }

        $value = $answer['is_correct'] ?? $answer['isCorrect'] ?? $answer['correct'] ?? false;
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value === 1;
        }
        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
        }
        return false;
    }

    protected function answerText($answer): string
    {
        if (!is_array($answer)) {
            return (string) $answer;
        }

        return (string) (
            $answer['text']
            ?? $answer['answer_text']
            ?? $answer['content']
            ?? $answer['label']
            ?? ''
        );
    }

    protected function comparableAnswerText(mixed $value): string
    {
        if (is_array($value)) {
            $text = (string) ($value['text'] ?? $value['answer_text'] ?? $value['content'] ?? $value['label'] ?? $value['value'] ?? '');
        } elseif (is_object($value)) {
            $text = (string) ($value->text ?? $value->answer_text ?? $value->content ?? $value->label ?? $value->value ?? '');
        } else {
            $text = (string) $value;
        }

        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text)));
    }

    protected function resolveSelectedAnswerIndex(mixed $userAnswer, array $answers): ?int
    {
        if ($userAnswer === null || $userAnswer === '') {
            return null;
        }

        if (is_array($userAnswer)) {
            foreach (['index', 'answerIndex', 'answer_index', 'selectedIndex', 'selected_index'] as $key) {
                if (array_key_exists($key, $userAnswer)) {
                    $idx = $this->normalizeAnswerIndex($userAnswer[$key]);
                    if ($idx !== null && array_key_exists($idx, $answers)) {
                        return $idx;
                    }
                }
            }

            foreach (['id', 'answer_id', 'answerId', 'value'] as $key) {
                if (!array_key_exists($key, $userAnswer)) {
                    continue;
                }
                $resolved = $this->resolveSelectedAnswerIndex($userAnswer[$key], $answers);
                if ($resolved !== null) {
                    return $resolved;
                }
            }

            foreach (['text', 'answer_text', 'content', 'label'] as $key) {
                if (!array_key_exists($key, $userAnswer)) {
                    continue;
                }
                $resolved = $this->resolveSelectedAnswerIndex((string) $userAnswer[$key], $answers);
                if ($resolved !== null) {
                    return $resolved;
                }
            }

            return null;
        }

        $raw = (string) $userAnswer;
        $numeric = $this->normalizeAnswerIndex($raw);
        if ($numeric !== null && array_key_exists($numeric, $answers)) {
            return $numeric;
        }

        foreach ($answers as $index => $answer) {
            if (!is_array($answer) && !is_object($answer)) {
                continue;
            }

            foreach (['id', 'answer_id', 'value'] as $idKey) {
                $answerId = is_array($answer) ? ($answer[$idKey] ?? null) : ($answer->{$idKey} ?? null);
                if ($answerId !== null && (string) $answerId === $raw) {
                    return (int) $index;
                }
            }
        }

        $needle = $this->comparableAnswerText($raw);
        if ($needle === '') {
            return null;
        }

        foreach ($answers as $index => $answer) {
            if ($this->comparableAnswerText($answer) === $needle) {
                return (int) $index;
            }
        }

        return null;
    }

    protected function buildMatchingQuestionData($question, ?Test $test, int $userId, int $attemptNumber): array
    {
        $payload = $this->normalizeArrayLike($question->payload ?? null) ?? [];
        $pairs = [];

        if (is_array($payload['pairs'] ?? null)) {
            $pairs = array_values($payload['pairs']);
        } else {
            $answers = $this->normalizeArrayLike($question->answers ?? null) ?? [];
            foreach ($answers as $answer) {
                if (!is_array($answer)) {
                    continue;
                }
                if (array_key_exists('left', $answer) || array_key_exists('right', $answer)) {
                    $pairs[] = $answer;
                } elseif (array_key_exists('pair', $answer) && is_array($answer['pair'])) {
                    $pairs[] = $answer['pair'];
                }
            }
        }

        $leftItems = [];
        $rightItems = [];

        foreach ($pairs as $index => $pair) {
            if (is_string($pair) && str_contains($pair, '|')) {
                [$leftRaw, $rightRaw] = array_pad(explode('|', $pair, 2), 2, '');
                $pair = ['left' => trim($leftRaw), 'right' => trim($rightRaw)];
            }

            if (!is_array($pair)) {
                continue;
            }

            $leftText = trim((string) ($pair['left'] ?? $pair['question'] ?? $pair['prompt'] ?? $pair['text'] ?? ''));
            $rightText = trim((string) ($pair['right'] ?? $pair['answer'] ?? $pair['answer_text'] ?? $pair['value'] ?? $pair['content'] ?? ''));
            if ($leftText === '' || $rightText === '') {
                continue;
            }

            $leftItems[] = ['id' => (string) $index, 'text' => $leftText];
            $rightItems[] = ['id' => (string) $index, 'text' => $rightText];
        }

        $seedBase = $test
            ? $this->buildSelectionSeedBase($test, $userId, $attemptNumber) . ":q{$question->id}:matching"
            : "exam:{$question->id}:{$attemptNumber}:matching";

        return [
            'leftItems' => $leftItems,
            'rightItems' => $this->shuffleBySeed($rightItems, $seedBase),
            'correctMap' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $rightItems)),
        ];
    }

    protected function buildOrderingQuestionData($question, ?Test $test, int $userId, int $attemptNumber): array
    {
        $payload = $this->normalizeArrayLike($question->payload ?? null) ?? [];
        $items = [];

        if (is_array($payload['items'] ?? null)) {
            $items = array_values($payload['items']);
        } else {
            $answers = $this->normalizeArrayLike($question->answers ?? null) ?? [];
            foreach ($answers as $answer) {
                if (is_array($answer)) {
                    $text = trim((string) ($answer['text'] ?? $answer['answer_text'] ?? $answer['content'] ?? $answer['label'] ?? ''));
                    if ($text !== '') {
                        $items[] = $text;
                    }
                    continue;
                }

                if (is_scalar($answer) || $answer === null) {
                    $text = trim((string) $answer);
                    if ($text !== '') {
                        $items[] = $text;
                    }
                }
            }
        }

        $normalized = [];
        foreach ($items as $index => $item) {
            $text = is_array($item)
                ? (string) ($item['text'] ?? $item['label'] ?? $item['content'] ?? '')
                : (string) $item;
            if (trim($text) === '') {
                continue;
            }
            $normalized[] = ['id' => (string) $index, 'text' => $text];
        }

        $seedBase = $test
            ? $this->buildSelectionSeedBase($test, $userId, $attemptNumber) . ":q{$question->id}:ordering"
            : "exam:{$question->id}:{$attemptNumber}:ordering";

        return [
            'items' => $this->shuffleBySeed($normalized, $seedBase),
            'correctOrder' => array_values(array_map(static fn ($item) => (string) ($item['id'] ?? ''), $normalized)),
        ];
    }

    protected function buildSelectionSeedBase(Test $test, int $userId, int $attemptNumber): string
    {
        $selection = is_array($test->question_selection) ? $test->question_selection : [];
        $seed = trim((string)($selection['seed'] ?? ''));
        $variantPoolSize = max(1, min(26, (int)($selection['variant_pool_size'] ?? 1)));
        $variantLabel = 'A';
        if ($variantPoolSize > 1) {
            $variantIndex = abs(crc32("{$test->id}:{$userId}")) % $variantPoolSize;
            $variantLabel = chr(65 + $variantIndex);
        }

        return "{$test->id}:{$userId}:{$attemptNumber}:seed:{$seed}:variant:{$variantLabel}";
    }

    protected function resolveAnswersOrderForTestAttempt(Test $test, $question, int $userId, int $attemptNumber): array
    {
        $answers = $question->answers ?? [];
        if (!is_array($answers)) {
            $answers = [];
        }

        $type = $question->type ?? 'multiple_choice';
        if (! in_array($type, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            return ['answers' => $answers, 'correct_index' => null, 'correct_indices' => []];
        }

        if ($test->randomize_answers && count($answers) > 1) {
            $seedBase = $this->buildSelectionSeedBase($test, $userId, $attemptNumber) . ":q{$question->id}";
            $indexed = [];
            foreach ($answers as $idx => $ans) {
                $key = hash('sha1', $seedBase . ":a{$idx}:" . $this->answerText($ans));
                $indexed[] = ['key' => $key, 'ans' => $ans];
            }
            usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);
            $answers = array_values(array_map(fn ($x) => $x['ans'], $indexed));
        }

        $correctIndices = $this->resolveCorrectAnswerIndices($answers, $type);

        return [
            'answers' => $answers,
            'correct_index' => $correctIndices[0] ?? null,
            'correct_indices' => $correctIndices,
        ];
    }

    protected function selectQuestionsForTestAttempt(Test $test, int $userId, int $attemptNumber)
    {
        return $this->questionSelectionService->selectForAttempt($test, $userId, $attemptNumber);
    }

    protected function buildTestQuestionResultWire(TestResult $testResult, $question, array $userAnswers): ?array
    {
        if (!$question) {
            return null;
        }

        $userAnswer = $userAnswers[$question->id] ?? $userAnswers[(string) $question->id] ?? $userAnswers[(int) $question->id] ?? null;
        $questionType = $question->type ?? 'multiple_choice';

        $attemptNumber = (int) ($testResult->attempt_number ?? 1);
        $order = $this->answerOrderService->resolveChoiceOrderForAttempt(
            $testResult->test,
            $question,
            (int) $testResult->user_id,
            $attemptNumber
        );

        // Result payloads expose stored (original) indices, so keep every field in that order.
        $orderedAnswers = $order['original_answers'];
        $correctIndices = $order['correct_original_indices'];
        $correctAnswerIndex = $correctIndices[0] ?? null;
        $originalSelected = $this->answerOrderService->selectedOriginalIndicesFromStored(
            $userAnswer,
            $questionType,
            $order
        );
        $selectedIndices = $originalSelected;
        $selectedAnswerIndex = $selectedIndices[0] ?? null;
        $matching = null;
        $ordering = null;
        $processedAnswers = [];

        if ($questionType === 'matching') {
            $matching = $this->buildMatchingQuestionData(
                $question,
                $testResult->test,
                (int) $testResult->user_id,
                (int) ($testResult->attempt_number ?? 1)
            );
        } elseif ($questionType === 'ordering') {
            $ordering = $this->buildOrderingQuestionData(
                $question,
                $testResult->test,
                (int) $testResult->user_id,
                (int) ($testResult->attempt_number ?? 1)
            );
        } elseif (is_array($orderedAnswers)) {
            foreach ($orderedAnswers as $displayIndex => $answer) {
                $answerData = is_array($answer) ? $answer : ['text' => $answer];
                $originalIndex = $displayIndex;

                $processedAnswers[] = [
                    'id' => $answerData['id'] ?? $answerData['answer_id'] ?? $displayIndex,
                    'text' => $this->answerText($answerData),
                    'answer_text' => $this->answerText($answerData),
                    'content' => $this->answerText($answerData),
                    'is_correct' => in_array((int) $originalIndex, $correctIndices, true),
                    'is_selected' => in_array((int) $originalIndex, $originalSelected, true),
                    'order' => $answerData['order'] ?? $displayIndex,
                ];
            }
        }

        $isUserAnswerCorrect = null;
        if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            $isUserAnswerCorrect = $this->answerOrderService->gradeChoiceInOriginalSpace(
                $questionType,
                $originalSelected,
                $correctIndices
            );
        } elseif ($questionType === 'matching') {
            $isUserAnswerCorrect = $this->isSequenceAnswerCorrect($userAnswer, $matching['correctMap'] ?? []);
        } elseif ($questionType === 'ordering') {
            $isUserAnswerCorrect = $this->isSequenceAnswerCorrect($userAnswer, $ordering['correctOrder'] ?? []);
        }

        return [
            'id' => $question->id,
            'type' => $questionType,
            'question_type' => $questionType,
            'text' => $question->content ?? '',
            'content' => $question->content ?? '',
            'question_text' => $question->content ?? '',
            'metadata' => is_array($question->metadata ?? null) ? $question->metadata : null,
            'points' => $question->points ?? 1,
            'order' => $question->order ?? 0,
            'explanation' => $question->explanation ?? null,
            'answers' => $processedAnswers,
            'options' => array_map(fn ($answer) => $answer['text'] ?? '', $processedAnswers),
            'answerIndex' => $correctAnswerIndex,
            'answerIndices' => $questionType === 'multiple_choice' ? $correctIndices : null,
            'matching' => $matching,
            'ordering' => $ordering,
            'user_answer' => $userAnswer,
            'user_answer_index' => $selectedAnswerIndex,
            'user_answer_indices' => $originalSelected,
            'user_answer_display_indices' => $selectedIndices,
            'is_correct' => $isUserAnswerCorrect,
            'correct_answer_index' => $correctAnswerIndex,
            'correct_answer_indices' => $correctIndices,
        ];
    }

    protected function buildLegacyExamQuestionResultWire(ExamResult $examResult, $question, array $userAnswers): array
    {
        $userAnswer = $userAnswers[$question->id] ?? $userAnswers[(string) $question->id] ?? $userAnswers[(int) $question->id] ?? null;
        $questionType = $question->question_type ?? $question->type ?? 'multiple_choice';
        $matching = null;
        $ordering = null;
        $processedAnswers = [];
        $correctIndices = [];
        $correctAnswerIndex = null;
        $selectedIndices = [];

        if ($questionType === 'matching') {
            $matching = $this->buildMatchingQuestionData(
                $question,
                null,
                (int) $examResult->user_id,
                (int) ($examResult->attempt_number ?? 1)
            );
        } elseif ($questionType === 'ordering') {
            $ordering = $this->buildOrderingQuestionData(
                $question,
                null,
                (int) $examResult->user_id,
                (int) ($examResult->attempt_number ?? 1)
            );
        } else {
            $legacyAnswers = $question->answers->values();
            $legacyAnswerRows = $legacyAnswers->all();
            $selectedIndices = $this->resolveSelectedAnswerIndices($userAnswer, $legacyAnswerRows);
            $selectedAnswerIndex = $selectedIndices[0] ?? null;

            foreach ($legacyAnswers as $index => $answer) {
                $isCorrect = (bool) ($answer->is_correct ?? false);
                if ($isCorrect) {
                    $correctIndices[] = (int) $index;
                }

                $processedAnswers[] = [
                    'id' => $answer->id,
                    'text' => $answer->answer_text ?? $answer->content ?? '',
                    'answer_text' => $answer->answer_text ?? $answer->content ?? '',
                    'content' => $answer->answer_text ?? $answer->content ?? '',
                    'is_correct' => $isCorrect,
                    'is_selected' => in_array((int) $index, $selectedIndices, true),
                    'order' => $answer->order ?? $index,
                ];
            }

            if ($questionType === 'single_choice' || $questionType === 'true_false' || $questionType === 'yes_no') {
                $correctIndices = $correctIndices !== [] ? [$correctIndices[0]] : [];
            } else {
                $correctIndices = array_values(array_unique($correctIndices));
            }
            $correctAnswerIndex = $correctIndices[0] ?? null;
        }

        $isUserAnswerCorrect = null;
        if (in_array($questionType, ['multiple_choice', 'single_choice', 'true_false', 'yes_no'], true)) {
            $legacyRows = $question->answers->values()->all();
            $isUserAnswerCorrect = $this->gradeChoiceQuestion(
                $questionType,
                $correctIndices,
                $userAnswer,
                $legacyRows
            );
        } elseif ($questionType === 'matching') {
            $isUserAnswerCorrect = $this->isSequenceAnswerCorrect($userAnswer, $matching['correctMap'] ?? []);
        } elseif ($questionType === 'ordering') {
            $isUserAnswerCorrect = $this->isSequenceAnswerCorrect($userAnswer, $ordering['correctOrder'] ?? []);
        }

        return [
            'id' => $question->id,
            'type' => $questionType,
            'question_type' => $questionType,
            'text' => $question->question_text ?? $question->content ?? '',
            'content' => $question->question_text ?? $question->content ?? '',
            'question_text' => $question->question_text ?? $question->content ?? '',
            'metadata' => is_array($question->metadata ?? null) ? $question->metadata : null,
            'points' => $question->points ?? 1,
            'order' => $question->order ?? 0,
            'explanation' => $question->explanation ?? null,
            'answers' => $processedAnswers,
            'options' => array_map(fn ($answer) => $answer['text'] ?? '', $processedAnswers),
            'answerIndex' => $correctAnswerIndex,
            'answerIndices' => $questionType === 'multiple_choice' ? $correctIndices : null,
            'matching' => $matching,
            'ordering' => $ordering,
            'user_answer' => $userAnswer,
            'user_answer_index' => $selectedAnswerIndex ?? null,
            'user_answer_indices' => $selectedIndices,
            'is_correct' => $isUserAnswerCorrect,
            'correct_answer_index' => $correctAnswerIndex,
            'correct_answer_indices' => $correctIndices,
        ];
    }

    /**
     * Get all exam results for the authenticated user
     * Includes both legacy ExamResult and new TestResult
     */
    public function index(Request $request)
    {
        try {
            $user = Auth::user();
            
            // Get legacy exam results (only if exam_results table exists)
            $examResults = collect();
            if (SchemaCache::hasTable('exam_results')) {
                try {
                    $examResults = ExamResult::with([
                        'exam.course:id,title',
                    ])
                    ->where('user_id', $user->id)
                    ->get()
                    ->map(function($result) {
                        return [
                            'id' => $result->id,
                            'type' => 'exam', // Legacy type
                            'exam_id' => $result->exam_id,
                            'test_id' => null,
                            'user_id' => $result->user_id,
                            'attempt_number' => $result->attempt_number,
                            'score' => $result->score,
                            'max_score' => $result->total_points ?? $result->score,
                            'total_points' => $result->total_points ?? $result->score,
                            'percentage' => $result->percentage,
                            'passed' => $result->passed,
                            'answers' => $result->answers,
                            'completed_at' => $result->completed_at,
                            'needs_manual_review' => $result->needs_manual_review ?? false,
                            'reviewed_at' => $result->reviewed_at,
                            'exam' => $result->exam ? [
                                'id' => $result->exam->id,
                                'title' => $result->exam->title,
                                'course' => $result->exam->course ? [
                                    'id' => $result->exam->course->id,
                                    'title' => $result->exam->course->title,
                                ] : null,
                            ] : null,
                        ];
                    });
                } catch (\Exception $e) {
                    Log::warning('Error fetching legacy exam results', [
                        'error' => $e->getMessage(),
                    ]);
                    // Continue with empty collection
                }
            }
            
            // Get new test results
            $testResults = TestResult::with([
                'test:id,title,description,type,status',
                'course:id,title',
                'test.courses:id,title', // Get courses via pivot
            ])
            ->where('user_id', $user->id)
            ->get()
            ->map(function($result) {
                $course = $this->coursePayloadFromTestResult($result);
                
                return [
                    'id' => $result->id,
                    'type' => 'test', // New type
                    'exam_id' => null,
                    'test_id' => $result->test_id,
                    'course_id' => $result->course_id,
                    'user_id' => $result->user_id,
                    'attempt_number' => $result->attempt_number,
                    'score' => $result->score,
                    'max_score' => $result->max_score ?? $result->score,
                    'total_points' => $result->max_score ?? $result->score,
                    'percentage' => $result->percentage,
                    'passed' => $result->passed,
                    'answers' => $result->answers,
                    'completed_at' => $result->completed_at,
                    'needs_manual_review' => $result->status === 'pending_review' || (bool) ($result->needs_manual_review ?? false),
                    'reviewed_at' => $result->reviewed_at,
                    'status' => $result->status,
                    'test' => $result->test ? [
                        'id' => $result->test->id,
                        'title' => $result->test->title,
                        'course' => $course,
                    ] : null,
                    'exam' => $result->test ? [
                        'id' => $result->test->id,
                        'title' => $result->test->title,
                        'course' => $course,
                    ] : null,
                ];
            });
            
            $includePending = $request->query('view') === 'cards';
            // Combine every saved attempt. The UI displays attempt numbers, so hiding older attempts here is misleading.
            $allResults = $examResults->concat($testResults)
                ->filter(function ($row) use ($includePending) {
                    if (($row['status'] ?? null) === 'in_progress') {
                        return false;
                    }
                    if (! $includePending && (($row['status'] ?? null) === 'pending_review' || ($row['needs_manual_review'] ?? false))) {
                        return false;
                    }
                    return true;
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

            if ($request->query('view') === 'cards') {
                $cards = [];
                foreach ($this->latestResultRows($allResults) as $row) {
                    $cards[] = $this->resultCard($row);
                }

                return response()->json($cards);
            }
            
            return response()->json($allResults);
        } catch (\Exception $e) {
            \Log::error('Error fetching exam results', [
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'error' => 'Nu s-au putut încărca rezultatele',
                'message' => (config('app.debug') ? $e->getMessage() : null),
            ], 500);
        }
    }

    /**
     * Get a specific exam result with full details
     * Supports both legacy ExamResult and new TestResult
     */
    public function show(Request $request, $id)
    {
        try {
            $user = Auth::user();
            $preferredType = $request->query('type');

            $loadTestResult = fn () => TestResult::with([
                'test',
                'test.questions' => function ($query) {
                    $query->orderBy('order');
                },
                'test.questionBank' => function ($query) {
                    $query->select('id', 'title', 'description');
                },
                'test.questionBank.questions' => function ($query) {
                    $query->orderBy('order');
                },
                'course:id,title',
                'test.courses:id,title',
            ])
                ->where('user_id', $user->id)
                ->find($id);

            $testResult = $preferredType === 'exam' ? null : $loadTestResult();

            if ($testResult) {
                if (!$testResult->test) {
                    return response()->json([
                        'id' => $testResult->id,
                        'type' => 'test',
                        'exam_id' => null,
                        'test_id' => $testResult->test_id,
                        'course_id' => $testResult->course_id,
                        'user_id' => $testResult->user_id,
                        'attempt_number' => $testResult->attempt_number,
                        'score' => $testResult->score,
                        'max_score' => $testResult->max_score ?? $testResult->score,
                        'total_points' => $testResult->max_score ?? $testResult->score,
                        'percentage' => $testResult->percentage,
                        'passed' => $testResult->passed,
                        'answers' => is_array($testResult->answers) ? $testResult->answers : [],
                        'completed_at' => $testResult->completed_at,
                        'needs_manual_review' => $testResult->status === 'pending_review' || (bool) ($testResult->needs_manual_review ?? false),
                        'status' => $testResult->status,
                        'test' => null,
                        'exam' => null,
                    ]);
                }
                
                try {
                    $course = $this->coursePayloadFromTestResult($testResult);
                } catch (\Exception $e) {
                    $course = null;
                    Log::warning('Error loading course for test result', [
                        'test_result_id' => $testResult->id,
                        'error' => $e->getMessage(),
                    ]);
                }
                
                // Rebuild exact question set for this attempt (same deterministic selection as exam submit/show)
                $questions = collect();
                try {
                    $questions = $this->attemptService->hydrateQuestions($testResult->question_snapshot);
                    if ($questions->isEmpty()) {
                        if (!$testResult->test->relationLoaded('questionBank')) {
                            $testResult->test->load('questionBank');
                        }
                        $questions = $this->selectQuestionsForTestAttempt(
                            $testResult->test,
                            (int) $testResult->user_id,
                            (int) ($testResult->attempt_number ?? 1)
                        );
                    }
                } catch (\Exception $e) {
                    Log::warning('Error rebuilding attempt questions for test result', [
                        'test_result_id' => $testResult->id,
                        'error' => $e->getMessage(),
                    ]);
                }
                
                // Get user answers
                $userAnswers = $testResult->answers ?? [];
                if (!is_array($userAnswers)) {
                    $userAnswers = [];
                }

                $submittedOnly = $this->shouldShowOnlySubmittedAnswers($testResult->test);
                $revealSolutions = (bool) ($testResult->test->show_correct_answers ?? false) && ! $submittedOnly;
                
                return response()->json([
                    'id' => $testResult->id,
                    'type' => 'test',
                    'exam_id' => null,
                    'test_id' => $testResult->test_id,
                    'course_id' => $testResult->course_id,
                    'user_id' => $testResult->user_id,
                    'attempt_number' => $testResult->attempt_number,
                    'score' => $testResult->score,
                    'max_score' => $testResult->max_score ?? $testResult->score,
                    'total_points' => $testResult->max_score ?? $testResult->score,
                    'percentage' => $testResult->percentage,
                    'passed' => $testResult->passed,
                    'correct_answers_count' => $testResult->correct_answers_count,
                    'total_questions' => $testResult->total_questions,
                    'answers' => $userAnswers,
                    'completed_at' => $testResult->completed_at,
                    'needs_manual_review' => $testResult->status === 'pending_review' || (bool) ($testResult->needs_manual_review ?? false),
                    'manual_review_scores' => is_array($testResult->manual_review_scores) ? $testResult->manual_review_scores : null,
                    'reviewed_at' => $testResult->reviewed_at,
                    'status' => $testResult->status,
                    'show_only_submitted_answers' => $submittedOnly,
                    'test' => $testResult->test ? [
                        'id' => $testResult->test->id,
                        'title' => $testResult->test->title,
                        'description' => $testResult->test->description,
                        'type' => $testResult->test->type,
                        'status' => $testResult->test->status,
                        'course' => $course,
                    ] : null,
                    'exam' => $testResult->test ? [
                        'id' => $testResult->test->id,
                        'title' => $testResult->test->title,
                        'description' => $testResult->test->description,
                        'type' => $testResult->test->type,
                        'status' => $testResult->test->status,
                        'course' => $course,
                        'questions' => $questions->map(function($question) use ($userAnswers, $testResult, $revealSolutions, $submittedOnly) {
                            $wire = $this->buildTestQuestionResultWire($testResult, $question, $userAnswers);
                            if (! $wire) {
                                return null;
                            }

                            if ($submittedOnly) {
                                return $this->sanitizeQuestionWireForSubmittedOnly($wire);
                            }

                            return $revealSolutions
                                ? $wire
                                : $this->hideUnrevealedSolutionKeys($wire);
                        })->filter(function($q) {
                            return $q !== null;
                        }),
                    ] : null,
                ]);
            }
            
            // Fallback to legacy ExamResult (only if exam_results table exists)
            if (! SchemaCache::hasTable('exam_results')) {
                return response()->json([
                    'error' => 'Rezultatul nu a fost găsit',
                ], 404);
            }
            
            $examResult = ExamResult::with([
                'exam.course:id,title',
                'exam.questions' => function($query) {
                    $query->orderBy('order');
                },
                'exam.questions.answers' => function($query) {
                    $query->orderBy('order');
                }
            ])
            ->where('user_id', $user->id)
            ->find($id);

            if (! $examResult) {
                if ($preferredType === 'exam') {
                    $request->query->set('type', 'test');
                    return $this->show($request, $id);
                }

                return response()->json([
                    'error' => 'Rezultatul nu a fost găsit',
                ], 404);
            }

            if (! $examResult->exam) {
                return response()->json([
                    'id' => $examResult->id,
                    'type' => 'exam',
                    'exam_id' => $examResult->exam_id,
                    'test_id' => null,
                    'user_id' => $examResult->user_id,
                    'attempt_number' => $examResult->attempt_number,
                    'score' => $examResult->score,
                    'max_score' => $examResult->total_points ?? $examResult->score,
                    'total_points' => $examResult->total_points ?? $examResult->score,
                    'percentage' => $examResult->percentage,
                    'passed' => $examResult->passed,
                    'answers' => $examResult->answers ?? [],
                    'completed_at' => $examResult->completed_at,
                    'exam' => null,
                ]);
            }
            
            // Get user answers
            $userAnswers = $examResult->answers ?? [];
            $examSettings = is_array($examResult->exam->settings ?? null) ? $examResult->exam->settings : [];
            $submittedOnly = $this->shouldShowOnlySubmittedAnswers(null, $examSettings);
            
            return response()->json([
                'id' => $examResult->id,
                'type' => 'exam',
                'exam_id' => $examResult->exam_id,
                'test_id' => null,
                'user_id' => $examResult->user_id,
                'attempt_number' => $examResult->attempt_number,
                'score' => $examResult->score,
                'max_score' => $examResult->total_points ?? $examResult->score,
                'total_points' => $examResult->total_points ?? $examResult->score,
                'percentage' => $examResult->percentage,
                'passed' => $examResult->passed,
                'answers' => $userAnswers,
                'completed_at' => $examResult->completed_at,
                'needs_manual_review' => $examResult->needs_manual_review ?? false,
                'manual_review_scores' => is_array($examResult->manual_review_scores) ? $examResult->manual_review_scores : null,
                'reviewed_at' => $examResult->reviewed_at,
                'show_only_submitted_answers' => $submittedOnly,
                'exam' => $examResult->exam ? [
                    'id' => $examResult->exam->id,
                    'title' => $examResult->exam->title,
                    'course' => $examResult->exam->course ? [
                        'id' => $examResult->exam->course->id,
                        'title' => $examResult->exam->course->title,
                    ] : null,
                    'questions' => $examResult->exam->questions->map(function($question) use ($userAnswers, $examResult, $submittedOnly) {
                        $wire = $this->buildLegacyExamQuestionResultWire($examResult, $question, $userAnswers);

                        return $submittedOnly
                            ? $this->sanitizeQuestionWireForSubmittedOnly($wire)
                            : $wire;
                    }),
                ] : null,
            ]);
        } catch (\Exception $e) {
            \Log::error('Error fetching exam result', [
                'result_id' => $id,
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'error' => 'Nu s-a putut încărca rezultatul',
                'message' => (config('app.debug') ? $e->getMessage() : null),
            ], 500);
        }
    }
}
