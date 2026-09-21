<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamQuestion;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\Test;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Materializează întrebări din bănci (foldere) în exam_questions la salvare,
 * ca elevii să primească același set ca la examenele legacy.
 */
class ExamBankQuestionSyncService
{
    public function shouldSync(?array $settings): bool
    {
        if (! is_array($settings)) {
            return false;
        }
        if ($this->selectionMode($settings) === 'questions') {
            return array_key_exists('question_ids', $settings);
        }
        if (($settings['selection_mode'] ?? '') === 'tags') {
            return $this->normalizeTags($settings['tags'] ?? []) !== [];
        }

        return $this->normalizeIds($settings['folder_ids'] ?? []) !== [];
    }

    /**
     * Înlocuiește întrebările examenului cu un snapshot din bănci sau din selecție explicită.
     * Returnează numărul de întrebări create sau 0 dacă nu s-a făcut nimic.
     */
    public function syncFromSettings(Exam $exam, ?array $settings, ?User $actor): int
    {
        if (! $this->shouldSync($settings)) {
            return 0;
        }

        $mode = (string) ($settings['selection_mode'] ?? 'folders');
        if ($mode === 'questions') {
            $selected = $this->poolFromQuestionIds($this->normalizeIds($settings['question_ids'] ?? []), $actor);
        } elseif ($mode === 'tags') {
            $folderIds = $this->normalizeIds($settings['folder_ids'] ?? []);
            $pool = $folderIds !== []
                ? $this->basePool($folderIds, $actor)
                : $this->basePool([], $actor);
            $selected = $this->filterByTags($pool, $this->normalizeTags($settings['tags'] ?? []));
        } else {
            $selected = $this->poolFromFolders($settings, $exam, $actor);
        }

        if ($selected->isEmpty()) {
            return DB::transaction(function () use ($exam) {
                ExamQuestion::where('exam_id', $exam->id)->delete();

                return 0;
            });
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

    protected function selectionMode(?array $settings): string
    {
        return (($settings['selection_mode'] ?? 'folders') === 'questions') ? 'questions' : 'folders';
    }

    protected function normalizeIds(array $raw): array
    {
        return array_values(array_unique(array_filter(array_map('intval', $raw))));
    }

    public function materializeFromTest(Test $test, Exam $exam, ?User $actor = null): int
    {
        if ($test->question_source === 'bank') {
            $settings = $this->examSettingsFromTest($test);
            if ($this->shouldSync($settings)) {
                return $this->syncFromSettings($exam, $settings, $actor);
            }
        }

        $questions = $test->questions()->orderBy('order')->get();
        if ($questions->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($exam, $questions) {
            ExamQuestion::where('exam_id', $exam->id)->delete();

            $order = 0;
            foreach ($questions as $q) {
                $examQ = $this->createExamQuestionFromBank($exam, $q, $order);
                $this->createAnswersFromBank($examQ, $q);
                $order++;
            }

            return $order;
        });
    }

    protected function examSettingsFromTest(Test $test): array
    {
        $selection = is_array($test->question_selection) ? $test->question_selection : [];
        $folderIds = array_values(array_filter(array_map('intval', (array) ($selection['folder_ids'] ?? []))));
        if ($folderIds === [] && $test->question_set_id) {
            $folderIds = [(int) $test->question_set_id];
        }

        $directCount = $test->relationLoaded('questions')
            ? $test->questions->count()
            : $test->questions()->count();

        return [
            'question_count' => max(1, (int) ($selection['count'] ?? $directCount ?: 10)),
            'selection_mode' => (string) ($selection['mode'] ?? 'folders'),
            'folder_ids' => $folderIds,
            'tags' => is_array($selection['tags'] ?? null) ? $selection['tags'] : [],
            'include_starred' => ! array_key_exists('include_starred', $selection) || (bool) $selection['include_starred'],
        ];
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

    protected function poolFromFolders(array $settings, Exam $exam, ?User $actor): Collection
    {
        $folderIds = $this->normalizeIds($settings['folder_ids'] ?? []);

        return $this->basePool($folderIds, $actor);
    }

    /**
     * Pool-ul e tot setul salvat; la încercare se trag N întrebări (stelele întâi, restul random per elev).
     */
    public function selectForAttempt(Exam $exam, int $userId, int $attemptNumber): Collection
    {
        $pool = $exam->questions instanceof Collection
            ? $exam->questions
            : collect($exam->questions ?? []);
        if ($pool->isEmpty()) {
            return collect();
        }

        $settings = is_array($exam->settings) ? $exam->settings : [];
        $count = max(0, (int) ($settings['question_count'] ?? 0));
        $includeStarred = ! array_key_exists('include_starred', $settings) || (bool) $settings['include_starred'];
        $attempt = max(1, $attemptNumber);
        $selected = $pool->values();

        if ($count > 0 && $count < $pool->count()) {
            $pickSeed = 'exam-pick:' . $exam->id . ':u' . $userId . ':a' . $attempt;
            $starredIds = $this->liveStarredSourceIds($pool);
            $isStarred = function ($question) use ($starredIds) {
                $sourceId = (int) (($question->payload['source_question_id'] ?? 0));
                if ($sourceId > 0 && isset($starredIds[$sourceId])) {
                    return true;
                }

                return (bool) ($question->payload['is_starred'] ?? false);
            };

            if ($includeStarred) {
                $starred = $pool->filter($isStarred)->sortBy('id')->values();
                $nonStarred = $this->orderDeterministic($pool->reject($isStarred)->values(), $pickSeed);
                $selected = $starred->take($count)->values();
                $remaining = $count - $selected->count();
                if ($remaining > 0) {
                    $selected = $selected->concat($nonStarred->take($remaining))->values();
                }
            } else {
                $selected = $this->orderDeterministic($pool, $pickSeed)->take($count)->values();
            }
        }

        if ((bool) ($settings['shuffle_questions'] ?? false) && $selected->count() > 1) {
            return $this->orderDeterministic(
                $selected,
                'exam-q:' . $exam->id . ':u' . $userId . ':a' . $attempt
            );
        }

        return $selected->sortBy(fn ($question) => (int) $question->order)->values();
    }

    protected function liveStarredSourceIds(Collection $pool): array
    {
        $sourceIds = $pool
            ->map(fn ($question) => (int) ($question->payload['source_question_id'] ?? 0))
            ->filter()
            ->unique()
            ->values();
        if ($sourceIds->isEmpty()) {
            return [];
        }

        return Question::query()
            ->whereIn('id', $sourceIds)
            ->where('is_starred', true)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->flip()
            ->all();
    }

    protected function poolFromQuestionIds(array $questionIds, ?User $actor): Collection
    {
        if ($questionIds === []) {
            return collect();
        }

        $query = Question::query()->whereIn('id', $questionIds);
        if ($actor && $actor->isInstructor()) {
            $uid = (int) $actor->id;
            $query->where(function ($q) use ($uid) {
                $q->whereHas('questionBank', fn ($bank) => $bank->where('created_by', $uid))
                    ->orWhereHas('test', fn ($test) => $test->where('created_by', $uid));
            });
        }

        $byId = $query->get()->keyBy('id');

        return collect($questionIds)
            ->map(fn ($id) => $byId->get($id))
            ->filter()
            ->values();
    }

    protected function basePool(array $folderIds, ?User $actor): Collection
    {
        $query = Question::query()
            ->orderBy('question_bank_id')
            ->orderBy('order');

        if ($folderIds !== []) {
            $query->whereIn('question_bank_id', $folderIds);
        } else {
            $query->whereNotNull('question_bank_id');
        }

        if ($actor && $actor->isInstructor()) {
            $allowedBankIds = QuestionBank::query()->where('created_by', $actor->id);
            if ($folderIds !== []) {
                $allowedBankIds->whereIn('id', $folderIds);
            }
            $query->whereIn('question_bank_id', $allowedBankIds->pluck('id'));
        }

        return $query->get();
    }

    protected function orderDeterministic(Collection $questions, string $seedBase): Collection
    {
        return $questions
            ->sortBy(fn ($q) => hash('sha1', $seedBase . ':q' . $q->id))
            ->values();
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
        $payload = [
            'source_question_id' => $q->id,
            'source_bank_id' => $q->question_bank_id,
            'source_test_id' => $q->test_id,
            'is_starred' => (bool) $q->is_starred,
        ];
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
