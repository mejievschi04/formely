<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\Test;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Creează un examen independent (catalog elevi) dintr-un test existent.
 * Testul rămâne neschimbat — util când conținutul a fost creat greșit ca „test”.
 */
class PromoteTestToStandaloneExamService
{
    public function __construct(
        protected ExamBankQuestionSyncService $questionSync
    ) {}

    public function promote(Test $test, User $user): Exam
    {
        return DB::transaction(function () use ($test, $user) {
            $examData = [
                'title' => $test->title,
                'description' => $test->description,
                'status' => ($test->status ?? 'draft') === 'published' ? 'published' : 'draft',
                'course_id' => null,
                'module_id' => null,
                'lesson_id' => null,
                'max_score' => 100,
                'passing_score' => (int) ($test->passing_score ?? 70),
                'time_limit_minutes' => $test->time_limit_minutes,
                'max_attempts' => $test->max_attempts,
                'is_required' => false,
                'settings' => [
                    'access_mode' => 'all_students',
                    'selected_students' => [],
                    'manual_review' => (bool) ($test->requires_manual_verification ?? false),
                    'show_feedback_instant' => (bool) ($test->show_results_immediately ?? false),
                    'show_correct_answers' => (bool) ($test->show_correct_answers ?? false),
                    'shuffle_questions' => (bool) ($test->randomize_questions ?? false),
                    'navigation_mode' => 'sequential',
                    'promoted_from_test_id' => $test->id,
                ],
            ];

            if (Schema::hasColumn('exams', 'created_by')) {
                $examData['created_by'] = $user->id;
            }

            $exam = Exam::create($examData);

            $count = $this->questionSync->materializeFromTest(
                $test->loadMissing(['questions', 'questionBank']),
                $exam,
                $user
            );

            if ($count === 0) {
                throw new \RuntimeException('Testul nu are întrebări de copiat în examen.');
            }

            return $exam->fresh(['questions.answers']);
        });
    }
}
