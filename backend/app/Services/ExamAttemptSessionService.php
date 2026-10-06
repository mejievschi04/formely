<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\ExamAnswer;
use App\Models\ExamAttemptSession;
use App\Models\ExamQuestion;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ExamAttemptSessionService
{
    public function __construct(protected ExamBankQuestionSyncService $questionSync)
    {
    }

    public function find(Exam $exam, User $user, int $attemptNumber): ?ExamAttemptSession
    {
        return ExamAttemptSession::query()
            ->where('exam_id', $exam->id)
            ->where('user_id', $user->id)
            ->where('attempt_number', $attemptNumber)
            ->first();
    }

    public function ensure(Exam $exam, User $user, int $attemptNumber): ExamAttemptSession
    {
        $existing = $this->find($exam, $user, $attemptNumber);
        if ($existing) {
            return $existing;
        }

        try {
            return DB::transaction(function () use ($exam, $user, $attemptNumber) {
                $locked = ExamAttemptSession::query()
                    ->where('exam_id', $exam->id)
                    ->where('user_id', $user->id)
                    ->where('attempt_number', $attemptNumber)
                    ->lockForUpdate()
                    ->first();
                if ($locked) {
                    return $locked;
                }

                $exam->loadMissing(['questions.answers']);
                $picked = $this->questionSync->selectForAttempt($exam, (int) $user->id, $attemptNumber);
                $picked->loadMissing('answers');
                $startedAt = now();
                $minutes = (int) ($exam->time_limit_minutes ?? 0);

                return ExamAttemptSession::create([
                    'exam_id' => $exam->id,
                    'user_id' => $user->id,
                    'attempt_number' => $attemptNumber,
                    'question_snapshot' => $this->snapshot($picked),
                    'answers' => [],
                    'started_at' => $startedAt,
                    'expires_at' => $minutes > 0 ? $startedAt->copy()->addMinutes($minutes) : null,
                ]);
            });
        } catch (QueryException $e) {
            $existing = $this->find($exam, $user, $attemptNumber);
            if ($existing) {
                return $existing;
            }

            throw $e;
        }
    }

    public function rememberAnswers(ExamAttemptSession $session, array $answers): ExamAttemptSession
    {
        $session->answers = $answers;
        $session->save();

        return $session;
    }

    public function firstStartedAt(int $examId, int $userId): ?Carbon
    {
        $started = ExamAttemptSession::query()
            ->where('exam_id', $examId)
            ->where('user_id', $userId)
            ->min('started_at');

        return $started ? Carbon::parse($started) : null;
    }

    public function questions(ExamAttemptSession $session): Collection
    {
        return collect($session->question_snapshot ?? [])->map(function (array $row) {
            $question = new ExamQuestion();
            $question->forceFill([
                'id' => (int) ($row['id'] ?? 0),
                'exam_id' => (int) ($row['exam_id'] ?? 0),
                'question_text' => $row['question_text'] ?? '',
                'question_type' => $row['question_type'] ?? 'multiple_choice',
                'order' => (int) ($row['order'] ?? 0),
                'points' => (int) ($row['points'] ?? 1),
                'payload' => is_array($row['payload'] ?? null) ? $row['payload'] : [],
            ]);
            $question->exists = true;

            $answers = collect($row['answers'] ?? [])->map(function (array $answer) use ($question) {
                $model = new ExamAnswer();
                $model->forceFill([
                    'id' => (int) ($answer['id'] ?? 0),
                    'exam_question_id' => (int) $question->id,
                    'answer_text' => $answer['answer_text'] ?? '',
                    'is_correct' => (bool) ($answer['is_correct'] ?? false),
                    'order' => (int) ($answer['order'] ?? 0),
                ]);
                $model->exists = true;

                return $model;
            })->values();
            $question->setRelation('answers', $answers);

            return $question;
        })->filter(fn (ExamQuestion $question) => (int) $question->id > 0)->values();
    }

    protected function snapshot(Collection $questions): array
    {
        return $questions->map(function (ExamQuestion $question) {
            $answers = $question->relationLoaded('answers')
                ? $question->answers
                : $question->answers()->get();

            return [
                'id' => (int) $question->id,
                'exam_id' => (int) $question->exam_id,
                'question_text' => $question->question_text,
                'question_type' => $question->question_type,
                'order' => (int) $question->order,
                'points' => (int) ($question->points ?? 1),
                'payload' => is_array($question->payload) ? $question->payload : [],
                'answers' => collect($answers)->map(fn ($answer) => [
                    'id' => (int) $answer->id,
                    'answer_text' => $answer->answer_text,
                    'is_correct' => (bool) $answer->is_correct,
                    'order' => (int) $answer->order,
                ])->values()->all(),
            ];
        })->values()->all();
    }
}
