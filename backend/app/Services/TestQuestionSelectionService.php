<?php

namespace App\Services;

use App\Models\Question;
use App\Models\Test;
use Illuminate\Support\Collection;

class TestQuestionSelectionService
{
    public function selectForAttempt(Test $test, int $userId, int $attemptNumber): Collection
    {
        $selection = $this->selectionArray($test);
        $seedBase = $this->buildAttemptSeedBase($test, $userId, $attemptNumber);
        return $this->resolveSelection($test, $selection, $seedBase, true)['selected'];
    }

    public function preview(Test $test, ?string $variant = null): array
    {
        $selection = $this->selectionArray($test);
        $seed = trim((string) ($selection['seed'] ?? ''));
        $variantPoolSize = max(1, min(26, (int) ($selection['variant_pool_size'] ?? 1)));
        $variantLabel = null;
        if ($variantPoolSize > 1) {
            $candidate = strtoupper(trim((string) ($variant ?? 'A')));
            if (!preg_match('/^[A-Z]$/', $candidate)) {
                $candidate = 'A';
            }
            $maxLabel = chr(64 + $variantPoolSize);
            $variantLabel = $candidate > $maxLabel ? $maxLabel : $candidate;
        }

        $seedBase = "admin-preview:{$test->id}:{$seed}";
        if ($variantLabel) {
            $seedBase .= ":variant:{$variantLabel}";
        }

        $resolved = $this->resolveSelection($test, $selection, $seedBase, false);
        return [
            'variant' => $variantLabel,
            'variant_pool_size' => $variantPoolSize,
            'seed' => $seed !== '' ? $seed : null,
            'all' => $resolved['all'],
            'matched' => $resolved['matched'],
            'selected' => $resolved['selected'],
            'include_starred' => $resolved['include_starred'],
        ];
    }

    protected function selectionArray(Test $test): array
    {
        return is_array($test->question_selection) ? $test->question_selection : [];
    }

    protected function buildAttemptSeedBase(Test $test, int $userId, int $attemptNumber): string
    {
        $selection = $this->selectionArray($test);
        $seed = trim((string) ($selection['seed'] ?? ''));
        $variantPoolSize = max(1, min(26, (int) ($selection['variant_pool_size'] ?? 1)));
        $variantLabel = 'A';
        if ($variantPoolSize > 1) {
            $variantIndex = abs(crc32("{$test->id}:{$userId}")) % $variantPoolSize;
            $variantLabel = chr(65 + $variantIndex);
        }

        return "{$test->id}:{$userId}:{$attemptNumber}:seed:{$seed}:variant:{$variantLabel}";
    }

    protected function resolveSelection(Test $test, array $selection, string $seedBase, bool $allowFallbackToFull): array
    {
        $all = $this->basePool($test, $selection);
        if ($all->isEmpty()) {
            return [
                'all' => collect(),
                'matched' => collect(),
                'selected' => collect(),
                'include_starred' => true,
            ];
        }

        if ($test->question_source !== 'bank') {
            $direct = $all;
            if ($test->randomize_questions) {
                $direct = $this->orderDeterministic($direct, $seedBase);
            }
            return [
                'all' => $all->values(),
                'matched' => $direct->values(),
                'selected' => $direct->values(),
                'include_starred' => true,
            ];
        }

        $mode = (string) ($selection['mode'] ?? '');
        $count = max(0, (int) ($selection['count'] ?? 0));
        $difficulty = $selection['difficulty'] ?? null;
        $tags = $selection['tags'] ?? null;
        $includeStarred = !array_key_exists('include_starred', $selection) || (bool) $selection['include_starred'];

        $difficultyList = [];
        if (is_string($difficulty) && $difficulty !== '') {
            $difficultyList = [$difficulty];
        }
        if (is_array($difficulty)) {
            $difficultyList = array_values(array_filter(array_map('strval', $difficulty)));
        }

        $tagList = [];
        if (is_string($tags) && $tags !== '') {
            $tagList = [$tags];
        }
        if (is_array($tags)) {
            $tagList = array_values(array_filter(array_map('strval', $tags)));
        }
        $tagList = array_values(array_unique(array_map(fn ($t) => mb_strtolower(trim($t)), $tagList)));

        $matched = $all->filter(function ($q) use ($difficultyList, $tagList) {
            $meta = is_array($q->metadata) ? $q->metadata : [];
            $qDifficulty = isset($meta['difficulty']) ? (string) $meta['difficulty'] : '';
            $qTags = $meta['tags'] ?? [];
            if (is_string($qTags)) {
                $qTags = array_map('trim', explode(',', $qTags));
            }
            if (!is_array($qTags)) {
                $qTags = [];
            }
            $qTags = array_values(array_filter(array_map(fn ($t) => mb_strtolower(trim((string) $t)), $qTags)));

            if (!empty($difficultyList) && !in_array($qDifficulty, $difficultyList, true)) {
                return false;
            }
            if (!empty($tagList) && empty(array_intersect($tagList, $qTags))) {
                return false;
            }
            return true;
        })->values();

        if ($matched->isEmpty() && $allowFallbackToFull) {
            $matched = $all->values();
        }

        $useRandom = ($mode === 'random') || $test->randomize_questions;
        if ($useRandom) {
            $matched = $this->orderDeterministic($matched, $seedBase);
        }

        $selected = $matched;
        if ($includeStarred) {
            // Starred questions are mandatory for everyone (same shared core).
            $starred = $matched
                ->filter(fn ($q) => (bool) $q->is_starred)
                ->sortBy('id')
                ->values();

            $nonStarred = $matched
                ->reject(fn ($q) => (bool) $q->is_starred)
                ->values();

            // count applies to variable (non-starred) questions.
            if ($count > 0) {
                $nonStarred = $nonStarred->take($count)->values();
            }

            $selected = $starred->concat($nonStarred)->unique('id')->values();
        } elseif ($count > 0) {
            // Without starred inclusion, count is the total selected size.
            $selected = $selected->take($count)->values();
        }

        return [
            'all' => $all->values(),
            'matched' => $matched->values(),
            'selected' => $selected->values(),
            'include_starred' => $includeStarred,
        ];
    }

    protected function basePool(Test $test, array $selection): Collection
    {
        if ($test->question_source !== 'bank') {
            return $test->questions()->orderBy('order')->get();
        }

        $folderIds = is_array($selection['folder_ids'] ?? null)
            ? array_values(array_unique(array_filter(array_map('intval', $selection['folder_ids']))))
            : [];

        if (!empty($folderIds)) {
            return Question::query()
                ->whereIn('question_bank_id', $folderIds)
                ->orderBy('question_bank_id')
                ->orderBy('order')
                ->get();
        }

        if ($test->questionBank) {
            return $test->questionBank->questions()->orderBy('order')->get();
        }

        return collect();
    }

    protected function orderDeterministic(Collection $questions, string $seedBase): Collection
    {
        return $questions
            ->sortBy(fn ($q) => hash('sha1', $seedBase . ':q' . $q->id))
            ->values();
    }
}
