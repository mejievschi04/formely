<?php

namespace App\Services;

use App\Models\Test;

/**
 * Rezolvă ordinea variantelor afișate elevului (shuffle determinist) și
 * normalizează răspunsurile salvate la indici stabili din baza de date.
 */
class TestAttemptAnswerOrderService
{
    public function buildSelectionSeedBase(Test $test, int $userId, int $attemptNumber): string
    {
        $selection = is_array($test->question_selection) ? $test->question_selection : [];
        $seed = trim((string) ($selection['seed'] ?? ''));
        $variantPoolSize = max(1, min(26, (int) ($selection['variant_pool_size'] ?? 1)));
        $variantLabel = 'A';
        if ($variantPoolSize > 1) {
            $variantIndex = abs(crc32("{$test->id}:{$userId}")) % $variantPoolSize;
            $variantLabel = chr(65 + $variantIndex);
        }

        return "{$test->id}:{$userId}:{$attemptNumber}:seed:{$seed}:variant:{$variantLabel}";
    }

    public function answerText(mixed $answer): string
    {
        if (! is_array($answer)) {
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

    public function isAnswerCorrectFlag(mixed $answer): bool
    {
        if (! is_array($answer)) {
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

    /**
     * @return int[]
     */
    public function correctIndicesForAnswers(array $answers, string $type): array
    {
        if (! in_array($type, ['multiple_choice', 'single_choice', 'true_false'], true)) {
            return [];
        }

        $indices = [];
        foreach ($answers as $idx => $answer) {
            if ($this->isAnswerCorrectFlag($answer)) {
                $indices[] = (int) $idx;
            }
        }

        if ($type === 'single_choice' || $type === 'true_false') {
            return $indices !== [] ? [$indices[0]] : [];
        }

        return array_values(array_unique($indices));
    }

    /**
     * @return array{
     *   original_answers: array,
     *   display_answers: array,
     *   display_to_original: array<int, int>,
     *   original_to_display: array<int, int>,
     *   correct_original_indices: int[],
     *   correct_display_indices: int[]
     * }
     */
    public function resolveChoiceOrderForAttempt(Test $test, $question, int $userId, int $attemptNumber): array
    {
        $originalAnswers = $question->answers ?? [];
        if (! is_array($originalAnswers)) {
            $originalAnswers = [];
        }

        $type = (string) ($question->type ?? 'multiple_choice');
        $correctOriginalIndices = $this->correctIndicesForAnswers($originalAnswers, $type);
        $displayToOriginal = [];
        $originalToDisplay = [];

        foreach ($originalAnswers as $idx => $_) {
            $displayToOriginal[(int) $idx] = (int) $idx;
            $originalToDisplay[(int) $idx] = (int) $idx;
        }

        $displayAnswers = $originalAnswers;

        if (in_array($type, ['multiple_choice', 'single_choice', 'true_false'], true)
            && $test->randomize_answers
            && count($originalAnswers) > 1
        ) {
            $seedBase = $this->buildSelectionSeedBase($test, $userId, $attemptNumber) . ":q{$question->id}";
            $indexed = [];
            foreach ($originalAnswers as $originalIdx => $ans) {
                $key = hash('sha1', $seedBase . ":a{$originalIdx}:" . $this->answerText($ans));
                $indexed[] = [
                    'key' => $key,
                    'original' => (int) $originalIdx,
                    'ans' => $ans,
                ];
            }
            usort($indexed, fn ($a, $b) => $a['key'] <=> $b['key']);

            $displayAnswers = [];
            $displayToOriginal = [];
            $originalToDisplay = [];
            foreach (array_values($indexed) as $displayIdx => $entry) {
                $displayAnswers[$displayIdx] = $entry['ans'];
                $displayToOriginal[$displayIdx] = $entry['original'];
                $originalToDisplay[$entry['original']] = $displayIdx;
            }
        }

        $correctDisplayIndices = [];
        foreach ($correctOriginalIndices as $originalIdx) {
            if (isset($originalToDisplay[$originalIdx])) {
                $correctDisplayIndices[] = $originalToDisplay[$originalIdx];
            }
        }

        return [
            'original_answers' => $originalAnswers,
            'display_answers' => $displayAnswers,
            'display_to_original' => $displayToOriginal,
            'original_to_display' => $originalToDisplay,
            'correct_original_indices' => $correctOriginalIndices,
            'correct_display_indices' => $correctDisplayIndices,
        ];
    }

    /**
     * @return int[]
     */
    public function selectedDisplayIndices(mixed $userAnswer, array $displayAnswers): array
    {
        if ($userAnswer === null || $userAnswer === '') {
            return [];
        }

        if (is_array($userAnswer)) {
            if (array_is_list($userAnswer)) {
                $indices = [];
                foreach ($userAnswer as $item) {
                    if (is_numeric($item) && array_key_exists((int) $item, $displayAnswers)) {
                        $indices[] = (int) $item;
                    }
                }

                return array_values(array_unique($indices));
            }

            foreach (['indices', 'selectedIndices', 'selected_indices', 'answers'] as $key) {
                if (isset($userAnswer[$key]) && is_array($userAnswer[$key])) {
                    return $this->selectedDisplayIndices($userAnswer[$key], $displayAnswers);
                }
            }

            foreach (['index', 'answerIndex', 'answer_index', 'selectedIndex', 'selected_index'] as $key) {
                if (array_key_exists($key, $userAnswer) && is_numeric($userAnswer[$key])) {
                    $idx = (int) $userAnswer[$key];
                    if (array_key_exists($idx, $displayAnswers)) {
                        return [$idx];
                    }
                }
            }

            foreach (['text', 'answer_text', 'content', 'label', 'value'] as $key) {
                if (! array_key_exists($key, $userAnswer)) {
                    continue;
                }
                $needle = $this->comparableAnswerText($userAnswer[$key]);
                if ($needle === '') {
                    continue;
                }
                foreach ($displayAnswers as $idx => $answer) {
                    if ($this->comparableAnswerText($answer) === $needle) {
                        return [(int) $idx];
                    }
                }
            }

            return [];
        }

        if (is_numeric($userAnswer) && array_key_exists((int) $userAnswer, $displayAnswers)) {
            return [(int) $userAnswer];
        }

        $needle = $this->comparableAnswerText($userAnswer);
        if ($needle === '') {
            return [];
        }

        foreach ($displayAnswers as $idx => $answer) {
            if ($this->comparableAnswerText($answer) === $needle) {
                return [(int) $idx];
            }
        }

        return [];
    }

    /**
     * @param  int[]  $displayIndices
     * @return int[]
     */
    public function displayIndicesToOriginal(array $displayIndices, array $displayToOriginal): array
    {
        $original = [];
        foreach ($displayIndices as $displayIdx) {
            if (isset($displayToOriginal[$displayIdx])) {
                $original[] = (int) $displayToOriginal[$displayIdx];
            }
        }

        return array_values(array_unique($original));
    }

    /**
     * @param  int[]  $originalIndices
     * @return int[]
     */
    public function originalIndicesToDisplay(array $originalIndices, array $originalToDisplay): array
    {
        $display = [];
        foreach ($originalIndices as $originalIdx) {
            if (isset($originalToDisplay[$originalIdx])) {
                $display[] = (int) $originalToDisplay[$originalIdx];
            }
        }

        return array_values(array_unique($display));
    }

    /**
     * @param  int[]  $selectedOriginal
     * @param  int[]  $correctOriginal
     */
    public function gradeChoiceInOriginalSpace(string $questionType, array $selectedOriginal, array $correctOriginal): bool
    {
        $correctOriginal = array_values(array_unique(array_map('intval', $correctOriginal)));
        sort($correctOriginal);
        $selectedOriginal = array_values(array_unique(array_map('intval', $selectedOriginal)));
        sort($selectedOriginal);

        if ($questionType === 'multiple_choice') {
            return $correctOriginal !== [] && $selectedOriginal === $correctOriginal;
        }

        return $correctOriginal !== [] && count($selectedOriginal) === 1 && $selectedOriginal[0] === $correctOriginal[0];
    }

    /**
     * Normalizează răspunsurile din payload-ul UI (indici afișare) la indici originali stabili.
     *
     * @param  iterable  $questions
     */
    public function normalizeSubmittedAnswers(Test $test, iterable $questions, int $userId, int $attemptNumber, array $rawAnswers): array
    {
        $normalized = [];

        foreach ($questions as $question) {
            $questionId = (int) $question->id;
            $userAnswer = $rawAnswers[$questionId] ?? $rawAnswers[(string) $questionId] ?? null;
            if ($userAnswer === null) {
                continue;
            }

            $type = (string) ($question->type ?? 'multiple_choice');
            if (! in_array($type, ['multiple_choice', 'single_choice', 'true_false'], true)) {
                $normalized[$questionId] = $userAnswer;
                continue;
            }

            $order = $this->resolveChoiceOrderForAttempt($test, $question, $userId, $attemptNumber);
            $displaySelected = $this->selectedDisplayIndices($userAnswer, $order['display_answers']);
            $originalSelected = $this->displayIndicesToOriginal($displaySelected, $order['display_to_original']);

            if ($type === 'multiple_choice') {
                $normalized[$questionId] = $originalSelected;
            } else {
                $normalized[$questionId] = $originalSelected[0] ?? null;
            }
        }

        return $normalized;
    }

    /**
     * @return int[]
     */
    public function selectedOriginalIndicesFromStored(mixed $storedAnswer, string $questionType, array $order): array
    {
        $originalAnswers = $order['original_answers'];
        $originalSelected = [];

        if ($questionType === 'multiple_choice') {
            if (is_array($storedAnswer) && array_is_list($storedAnswer)) {
                foreach ($storedAnswer as $item) {
                    if (is_numeric($item) && array_key_exists((int) $item, $originalAnswers)) {
                        $originalSelected[] = (int) $item;
                    }
                }
            } elseif (is_numeric($storedAnswer) && array_key_exists((int) $storedAnswer, $originalAnswers)) {
                $originalSelected[] = (int) $storedAnswer;
            }
        } elseif (is_numeric($storedAnswer) && array_key_exists((int) $storedAnswer, $originalAnswers)) {
            $originalSelected[] = (int) $storedAnswer;
        }

        if ($originalSelected !== []) {
            return array_values(array_unique($originalSelected));
        }

        // Compatibilitate: răspunsuri vechi salvate ca indici în ordinea afișată la submit.
        $legacyDisplay = $this->selectedDisplayIndices($storedAnswer, $order['display_answers']);

        return $this->displayIndicesToOriginal($legacyDisplay, $order['display_to_original']);
    }

    /**
     * @return int[]
     */
    public function selectedOriginalAsDisplay(mixed $storedAnswer, string $questionType, array $order): array
    {
        $originalSelected = $this->selectedOriginalIndicesFromStored($storedAnswer, $questionType, $order);

        return $this->originalIndicesToDisplay($originalSelected, $order['original_to_display']);
    }

    public function comparableAnswerText(mixed $value): string
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
}
