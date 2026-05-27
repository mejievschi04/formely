<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamQuestion;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Materializează întrebări din bănci (foldere/tag-uri) în exam_questions la salvare,
 * ca elevii să primească același set ca la examenele legacy.
 */
class ExamBankQuestionSyncService
{
    public function shouldSync(?array $settings): bool
    {
        if (! is_array($settings)) {
            return false;
        }
        $count = (int) ($settings['question_count'] ?? 0);

        return $count > 0;
    }

    /**
     * Înlocuiește întrebările examenului cu un snapshot din bănci.
     * Returnează numărul de întrebări create sau 0 dacă nu s-a făcut nimic.
     */
    public function syncFromSettings(Exam $exam, ?array $settings, ?User $actor): int
    {
        if (! $this->shouldSync($settings)) {
            return 0;
        }

        $folderIds = $this->normalizeIds($settings['folder_ids'] ?? []);
        $selectionMode = (string) ($settings['selection_mode'] ?? 'folders');
        $tagList = $this->normalizeTags($settings['tags'] ?? []);
        $count = max(0, (int) ($settings['question_count'] ?? 0));
        $includeStarred = ! array_key_exists('include_starred', $settings) || (bool) $settings['include_starred'];

        $pool = $this->basePool($folderIds, $selectionMode, $actor);
        if ($pool->isEmpty()) {
            return 0;
        }

        if ($selectionMode === 'tags' && $tagList !== []) {
            $pool = $this->filterByTags($pool, $tagList);
            if ($pool->isEmpty()) {
                return 0;
            }
        }

        $seedBase = 'exam-sync:' . $exam->id;
        $matched = $this->orderDeterministic($pool, $seedBase);

        $selected = $this->applyCountAndStarred($matched, $count, $includeStarred, $seedBase);
        if ($selected->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($exam, $selected) {
            ExamQuestion::where('exam_id', $exam->id)->delete();

            $order = 0;
            foreach ($selected as $q) {
                $examQ = $this->createExamQuestionFromBank($exam, $q, $order);
                $this->createAnswersFromBank($examQ, $q);
                $order++;
            }

            return $order;
        });
    }

    protected function normalizeIds(array $raw): array
    {
        return array_values(array_unique(array_filter(array_map('intval', $raw))));
    }

    protected function normalizeTags($raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(function ($t) {
            return mb_strtolower(trim((string) $t));
        }, $raw))));
    }

    protected function basePool(array $folderIds, string $selectionMode, ?User $actor): Collection
    {
        if ($folderIds !== []) {
            $query = Question::query()
                ->whereIn('question_bank_id', $folderIds)
                ->orderBy('question_bank_id')
                ->orderBy('order');

            if ($actor && $actor->isInstructor()) {
                $allowedBankIds = QuestionBank::query()
                    ->where('created_by', $actor->id)
                    ->whereIn('id', $folderIds)
                    ->pluck('id');
                $query->whereIn('question_bank_id', $allowedBankIds);
            }

            return $query->get();
        }

        if ($selectionMode === 'tags' && $actor) {
            $bankQuery = QuestionBank::query();
            if ($actor->isInstructor()) {
                $bankQuery->where('created_by', $actor->id);
            }
            $bankIds = $bankQuery->pluck('id');
            if ($bankIds->isEmpty()) {
                return collect();
            }

            return Question::query()
                ->whereIn('question_bank_id', $bankIds)
                ->orderBy('question_bank_id')
                ->orderBy('order')
                ->get();
        }

        return collect();
    }

    protected function filterByTags(Collection $pool, array $tagList): Collection
    {
        return $pool->filter(function ($q) use ($tagList) {
            $meta = is_array($q->metadata) ? $q->metadata : [];
            $qTags = $meta['tags'] ?? [];
            if (is_string($qTags)) {
                $qTags = array_map('trim', explode(',', $qTags));
            }
            if (! is_array($qTags)) {
                $qTags = [];
            }
            $qTags = array_values(array_filter(array_map(fn ($t) => mb_strtolower(trim((string) $t)), $qTags)));

            return $tagList !== [] && count(array_intersect($tagList, $qTags)) > 0;
        })->values();
    }

    protected function orderDeterministic(Collection $questions, string $seedBase): Collection
    {
        return $questions
            ->sortBy(fn ($q) => hash('sha1', $seedBase . ':q' . $q->id))
            ->values();
    }

    protected function applyCountAndStarred(Collection $matched, int $count, bool $includeStarred, string $seedBase): Collection
    {
        if ($includeStarred) {
            $starred = $matched->filter(fn ($q) => (bool) $q->is_starred)->sortBy('id')->values();
            $nonStarred = $matched->reject(fn ($q) => (bool) $q->is_starred)->values();
            $nonStarred = $this->orderDeterministic($nonStarred, $seedBase . ':ns');
            if ($count > 0) {
                $nonStarred = $nonStarred->take($count)->values();
            }

            return $starred->concat($nonStarred)->unique('id')->values();
        }

        $ordered = $this->orderDeterministic($matched, $seedBase);

        return $count > 0 ? $ordered->take($count)->values() : $ordered;
    }

    protected function mapQuestionType(?string $type): string
    {
        $t = strtolower((string) $type);
        $allowed = ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'];
        if (in_array($t, $allowed, true)) {
            return $t;
        }

        return 'multiple_choice';
    }

    protected function createExamQuestionFromBank(Exam $exam, Question $q, int $order): ExamQuestion
    {
        $questionType = $this->mapQuestionType($q->type);
        $payload = ['source_question_id' => $q->id, 'source_bank_id' => $q->question_bank_id];
        if ($questionType === 'matching') {
            $payload['pairs'] = $this->extractMatchingPairs($q);
        } elseif ($questionType === 'ordering') {
            $payload['items'] = $this->extractOrderingItems($q);
        }

        return ExamQuestion::create([
            'exam_id' => $exam->id,
            'question_text' => $q->content ?? '',
            'question_type' => $questionType,
            'points' => (int) ($q->points ?? 1),
            'order' => $order,
            'payload' => $payload,
        ]);
    }

    protected function createAnswersFromBank(ExamQuestion $examQ, Question $q): void
    {
        $questionType = $this->mapQuestionType($q->type);
        if (in_array($questionType, ['matching', 'ordering'], true)) {
            return;
        }

        $answers = is_array($q->answers) ? $q->answers : [];
        foreach (array_values($answers) as $idx => $item) {
            if (! is_array($item)) {
                continue;
            }
            $text = (string) ($item['text'] ?? $item['answer_text'] ?? $item['content'] ?? '');
            ExamAnswer::create([
                'exam_question_id' => $examQ->id,
                'answer_text' => $text,
                'is_correct' => (bool) ($item['is_correct'] ?? false),
                'order' => (int) ($item['order'] ?? $idx),
            ]);
        }
    }

    protected function extractMatchingPairs(Question $q): array
    {
        $answers = is_array($q->answers) ? $q->answers : [];
        $pairs = [];

        foreach ($answers as $item) {
            if (is_string($item) && str_contains($item, '|')) {
                [$leftRaw, $rightRaw] = array_pad(explode('|', $item, 2), 2, '');
                $item = ['left' => trim($leftRaw), 'right' => trim($rightRaw)];
            }

            if (! is_array($item)) {
                continue;
            }

            $left = trim((string) ($item['left'] ?? $item['text'] ?? $item['question'] ?? $item['prompt'] ?? ''));
            $right = trim((string) ($item['right'] ?? $item['answer_text'] ?? $item['answer'] ?? $item['content'] ?? ''));
            if ($left === '' || $right === '') {
                continue;
            }

            $pairs[] = ['left' => $left, 'right' => $right];
        }

        return $pairs;
    }

    protected function extractOrderingItems(Question $q): array
    {
        $answers = is_array($q->answers) ? $q->answers : [];
        $items = [];

        foreach ($answers as $item) {
            if (is_array($item)) {
                $text = trim((string) ($item['text'] ?? $item['answer_text'] ?? $item['content'] ?? $item['label'] ?? $item['item'] ?? ''));
            } else {
                $text = trim((string) $item);
            }

            if ($text !== '') {
                $items[] = $text;
            }
        }

        return $items;
    }
}
