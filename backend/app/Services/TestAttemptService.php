<?php

namespace App\Services;

use App\Models\Question;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use App\Models\UserTestAttemptGrant;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class TestAttemptService
{
    public function openAttemptQuery(int $userId, int $testId, ?int $courseId)
    {
        return TestResult::query()
            ->where('user_id', $userId)
            ->where('test_id', $testId)
            ->where('status', 'in_progress')
            ->when(
                $courseId,
                fn ($q) => $q->where('course_id', $courseId),
                fn ($q) => $q->whereNull('course_id')
            );
    }

    public function completedAttemptsQuery(int $userId, int $testId, ?int $courseId)
    {
        return TestResult::query()
            ->where('user_id', $userId)
            ->where('test_id', $testId)
            ->where('status', '!=', 'in_progress')
            ->when($courseId, function ($query) use ($courseId) {
                $query->where(function ($scope) use ($courseId) {
                    $scope->where('course_id', $courseId)->orWhereNull('course_id');
                });
            });
    }

    public function snapshotQuestions(Collection $questions): array
    {
        return $questions->map(function ($question) {
            return [
                'id' => (int) $question->id,
                'test_id' => $question->test_id,
                'question_bank_id' => $question->question_bank_id ?? null,
                'type' => $question->type ?? 'multiple_choice',
                'content' => $question->content,
                'answers' => $question->answers,
                'points' => (int) ($question->points ?? 1),
                'order' => $question->order ?? 0,
                'explanation' => $question->explanation ?? null,
                'metadata' => $question->metadata ?? null,
            ];
        })->values()->all();
    }

    public function hydrateQuestions(?array $snapshot): Collection
    {
        return collect($snapshot ?? [])->map(function (array $row) {
            $question = new Question();
            $question->forceFill($row);
            $question->id = (int) ($row['id'] ?? 0);
            $question->exists = true;

            return $question;
        })->filter(fn ($q) => (int) $q->id > 0)->values();
    }

    public function ensureOpenAttempt(Test $test, User $user, ?int $courseId, Collection $questions, int $attemptNumber, int $passingScore): TestResult
    {
        try {
            return DB::transaction(function () use ($test, $user, $courseId, $questions, $attemptNumber, $passingScore) {
                $existing = $this->openAttemptQuery((int) $user->id, (int) $test->id, $courseId)
                    ->lockForUpdate()
                    ->first();
                if ($existing) {
                    return $existing;
                }

                $startedAt = now();
                $limitMinutes = (int) ($test->time_limit_minutes ?? 0);

                return TestResult::create([
                    'test_id' => $test->id,
                    'course_id' => $courseId,
                    'user_id' => $user->id,
                    'attempt_number' => $attemptNumber,
                    'score' => 0,
                    'max_score' => $questions->sum(fn ($q) => (int) ($q->points ?? 1)),
                    'percentage' => 0,
                    'passed' => false,
                    'answers' => [],
                    'started_at' => $startedAt,
                    'expires_at' => $limitMinutes > 0 ? $startedAt->copy()->addMinutes($limitMinutes) : null,
                    'completed_at' => null,
                    'status' => 'in_progress',
                    'question_snapshot' => $this->snapshotQuestions($questions),
                    'passing_score_applied' => $passingScore,
                    'attempt_token' => (string) Str::uuid(),
                    'attempt_scope' => $this->openScope((int) $user->id, (int) $test->id, $courseId),
                ]);
            });
        } catch (QueryException $e) {
            $existing = $this->openAttemptQuery((int) $user->id, (int) $test->id, $courseId)->first();
            if ($existing) {
                return $existing;
            }

            throw $e;
        }
    }

    public function openScope(int $userId, int $testId, ?int $courseId): string
    {
        return $userId . ':' . $testId . ':' . (int) ($courseId ?? 0) . ':open';
    }

    public function extraAttemptsFor(int $userId, int $testId): int
    {
        if (! Schema::hasTable('user_test_attempt_grants')) {
            return 0;
        }

        return (int) UserTestAttemptGrant::query()
            ->where('user_id', $userId)
            ->where('test_id', $testId)
            ->value('extra_attempts');
    }

    public function allowedAttemptCount(Test $test, int $userId): ?int
    {
        if (! $test->max_attempts) {
            return null;
        }

        return (int) $test->max_attempts + $this->extraAttemptsFor($userId, (int) $test->id);
    }

    public function remainingAttemptsFor(Test $test, int $userId, int $completedCount, bool $hasOpenAttempt = false): ?int
    {
        $allowed = $this->allowedAttemptCount($test, $userId);
        if ($allowed === null) {
            return null;
        }

        return max(0, $allowed - $completedCount - ($hasOpenAttempt ? 1 : 0));
    }

    public function wouldExceedAttemptLimit(Test $test, int $userId, int $nextAttempt): bool
    {
        $allowed = $this->allowedAttemptCount($test, $userId);
        return $allowed !== null && $nextAttempt > $allowed;
    }

    public function grantExtraAttempt(int $userId, int $testId, int $grantedBy, ?int $courseId = null): UserTestAttemptGrant
    {
        return DB::transaction(function () use ($userId, $testId, $grantedBy, $courseId) {
            $grant = UserTestAttemptGrant::query()->firstOrCreate(
                ['user_id' => $userId, 'test_id' => $testId],
                ['extra_attempts' => 0, 'granted_by' => $grantedBy, 'course_id' => $courseId]
            );
            $grant->extra_attempts = (int) $grant->extra_attempts + 1;
            $grant->granted_by = $grantedBy;
            if ($courseId) {
                $grant->course_id = $courseId;
            }
            $grant->save();

            return $grant->fresh();
        });
    }

    public function attemptHasExpired(TestResult $attempt): bool
    {
        if (! $attempt->expires_at) {
            return false;
        }

        return Carbon::parse($attempt->expires_at)->addSeconds(15)->isPast();
    }

    public function closeExpiredAttempt(TestResult $attempt): void
    {
        if ($attempt->status !== 'in_progress') {
            return;
        }

        $attempt->update([
            'status' => 'expired',
            'completed_at' => now(),
            'passed' => false,
            'attempt_scope' => null,
        ]);
    }

    public function currentOpenAttempt(int $userId, int $testId, ?int $courseId): ?TestResult
    {
        $existing = $this->openAttemptQuery($userId, $testId, $courseId)->first();
        if (! $existing) {
            return null;
        }
        if ($this->attemptHasExpired($existing)) {
            $this->closeExpiredAttempt($existing);

            return null;
        }

        return $existing;
    }

    public function answerValue(array $answers, int $questionId): mixed
    {
        if (array_key_exists($questionId, $answers)) {
            return $answers[$questionId];
        }
        $key = (string) $questionId;
        if (array_key_exists($key, $answers)) {
            return $answers[$key];
        }

        return null;
    }

    public function hasAnswer(mixed $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        if (is_array($value) && count($value) === 0) {
            return false;
        }

        return true;
    }

    /**
     * Merge newly answered questions onto an in-progress attempt.
     * Already answered questions stay locked once a later question has an answer.
     * The latest answered question can still be updated until the student moves on.
     */
    public function mergeProgressAnswers(TestResult $attempt, array $incoming): array
    {
        $existing = is_array($attempt->answers) ? $attempt->answers : [];
        $questionIds = collect($attempt->question_snapshot ?? [])
            ->map(fn ($row) => (int) ($row['id'] ?? 0))
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();

        if ($questionIds === []) {
            return $this->normalizeAnswerMap(array_replace($existing, $incoming));
        }

        $firstUnanswered = null;
        $lastAnswered = null;
        foreach ($questionIds as $index => $questionId) {
            if ($this->hasAnswer($this->answerValue($existing, $questionId))) {
                $lastAnswered = $index;
            } elseif ($firstUnanswered === null) {
                $firstUnanswered = $index;
            }
        }
        if ($firstUnanswered === null) {
            $firstUnanswered = count($questionIds);
        }

        $writable = [];
        if ($firstUnanswered < count($questionIds)) {
            $writable[$questionIds[$firstUnanswered]] = true;
        }
        if ($lastAnswered !== null && ($lastAnswered + 1) === $firstUnanswered) {
            $writable[$questionIds[$lastAnswered]] = true;
        }

        foreach ($incoming as $rawId => $value) {
            $questionId = (int) $rawId;
            if ($questionId <= 0 || ! isset($writable[$questionId])) {
                continue;
            }
            unset($existing[$questionId], $existing[(string) $questionId]);
            $existing[(string) $questionId] = $value;
        }

        return $this->normalizeAnswerMap($existing);
    }

    /**
     * On final submit, keep already saved answers locked and fill the rest from the payload.
     */
    public function mergeSubmitAnswers(TestResult $attempt, array $incoming): array
    {
        $existing = $this->normalizeAnswerMap(is_array($attempt->answers) ? $attempt->answers : []);
        $incoming = $this->normalizeAnswerMap($incoming);
        $questionIds = collect($attempt->question_snapshot ?? [])
            ->map(fn ($row) => (int) ($row['id'] ?? 0))
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();

        if ($questionIds === []) {
            return array_replace($incoming, $existing);
        }

        $merged = [];
        foreach ($questionIds as $questionId) {
            $stored = $this->answerValue($existing, $questionId);
            if ($this->hasAnswer($stored)) {
                $merged[(string) $questionId] = $stored;
                continue;
            }
            $next = $this->answerValue($incoming, $questionId);
            if ($this->hasAnswer($next)) {
                $merged[(string) $questionId] = $next;
            }
        }

        return $merged;
    }

    public function persistProgressAnswers(TestResult $attempt, array $incoming): array
    {
        $merged = $this->mergeProgressAnswers($attempt, $incoming);
        $attempt->answers = $merged;
        $attempt->save();

        return $merged;
    }

    private function normalizeAnswerMap(array $answers): array
    {
        $normalized = [];
        foreach ($answers as $key => $value) {
            $questionId = (int) $key;
            if ($questionId <= 0) {
                continue;
            }
            $normalized[(string) $questionId] = $value;
        }

        return $normalized;
    }
}
