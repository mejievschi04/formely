<?php

namespace App\Services;

use App\Models\Test;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TestService
 * 
 * @deprecated Use TestBuilderService instead
 * This service is kept for backward compatibility
 * 
 * Handles standalone test creation and management
 * Separated from course logic
 */
class TestService
{
    /**
     * Create a new test
     */
    public function createTest(array $data, User $creator): Test
    {
        $test = Test::create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'type' => 'final',
            'status' => $data['status'] ?? 'draft',
            'time_limit_minutes' => $data['time_limit_minutes'] ?? null,
            'max_attempts' => $data['max_attempts'] ?? null,
            'randomize_questions' => $data['randomize_questions'] ?? false,
            'randomize_answers' => $data['randomize_answers'] ?? false,
            'show_results_immediately' => $data['show_results_immediately'] ?? true,
            'show_correct_answers' => $data['show_correct_answers'] ?? false,
            'allow_review' => $data['allow_review'] ?? true,
            'question_source' => $data['question_source'] ?? 'direct',
            'question_set_id' => $data['question_set_id'] ?? null,
            'created_by' => $creator->id,
            'version' => $data['version'] ?? '1.0.0',
        ]);

        // Add questions if provided
        if (isset($data['questions']) && is_array($data['questions'])) {
            $this->addQuestionsToTest($test, $data['questions']);
        }

        return $test;
    }

    /**
     * Add questions to a test
     */
    public function addQuestionsToTest(Test $test, array $questions): void
    {
        $questions = $this->applyDefaultPointsIfNeeded($questions);

        foreach ($questions as $index => $questionData) {
            Question::create([
                'test_id' => $test->id,
                'question_bank_id' => null,
                'type' => $this->normalizeQuestionType($questionData['type'] ?? 'multiple_choice'),
                'content' => $questionData['content'],
                'answers' => $questionData['answers'] ?? [],
                'points' => isset($questionData['points']) && $questionData['points'] !== '' ? (int) $questionData['points'] : 1,
                'order' => $questionData['order'] ?? $index,
                'explanation' => $questionData['explanation'] ?? null,
                'metadata' => $questionData['metadata'] ?? null,
            ]);
        }
    }

    /**
     * Update a test
     */
    public function updateTest(Test $test, array $data): Test
    {
        $test->update($data);
        return $test;
    }

    /**
     * Delete a test (soft delete)
     */
    public function deleteTest(Test $test): bool
    {
        return DB::transaction(function () use ($test) {
            if (\Illuminate\Support\Facades\Schema::hasTable('course_test')) {
                DB::table('course_test')->where('unlock_after_test_id', $test->id)->update(['unlock_after_test_id' => null]);
                DB::table('course_test')->where('test_id', $test->id)->delete();
            }

            return $test->delete();
        });
    }

    /**
     * Publish a test
     */
    public function publishTest(Test $test): Test
    {
        // Validate test has questions
        if ($test->question_source === 'direct' && $test->questions()->count() === 0) {
            throw new \Exception('Cannot publish test without questions');
        }

        if ($test->question_source === 'bank' && !$test->questionBank) {
            throw new \Exception('Cannot publish test without question bank');
        }

        $test->update(['status' => 'published']);
        return $test;
    }

    /**
     * Create a question bank
     */
    public function createQuestionBank(array $data, User $creator): QuestionBank
    {
        $bank = QuestionBank::create([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'status' => $data['status'] ?? 'draft',
            'created_by' => $creator->id,
        ]);

        // Add questions if provided
        if (isset($data['questions']) && is_array($data['questions'])) {
            $this->addQuestionsToBank($bank, $data['questions']);
        }

        return $bank;
    }

    /**
     * Add questions to a question bank
     */
    public function addQuestionsToBank(QuestionBank $bank, array $questions): void
    {
        foreach ($questions as $index => $questionData) {
            Question::create([
                'test_id' => null,
                'question_bank_id' => $bank->id,
                'type' => $this->normalizeQuestionType($questionData['type'] ?? 'multiple_choice'),
                'content' => $questionData['content'],
                'answers' => $questionData['answers'] ?? [],
                'points' => $questionData['points'] ?? 1,
                'order' => $questionData['order'] ?? $index,
                'explanation' => $questionData['explanation'] ?? null,
                'metadata' => $questionData['metadata'] ?? null,
            ]);
        }
    }

    /**
     * Link test to course
     */
    public function linkTestToCourse(Test $test, int $courseId, array $options = []): void
    {
        DB::table('course_test')->insert([
            'course_id' => $courseId,
            'test_id' => $test->id,
            'scope' => $options['scope'] ?? 'course',
            'scope_id' => $options['scope_id'] ?? null,
            'required' => $options['required'] ?? false,
            'passing_score' => $options['passing_score'] ?? 70,
            'order' => $options['order'] ?? 0,
            'unlock_after_previous' => $options['unlock_after_previous'] ?? false,
            'unlock_after_test_id' => $options['unlock_after_test_id'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Unlink test from course
     */
    public function unlinkTestFromCourse(Test $test, int $courseId, ?string $scope = null, ?int $scopeId = null): void
    {
        $query = DB::table('course_test')
            ->where('course_id', $courseId)
            ->where('test_id', $test->id);

        if ($scope) {
            $query->where('scope', $scope);
        }

        if ($scopeId) {
            $query->where('scope_id', $scopeId);
        }

        $query->delete();
    }

    /**
     * Implicit test total: 100 puncte, distribuite egal pe întrebări
     * când niciuna nu are punctaj introdus manual.
     */
    protected function applyDefaultPointsIfNeeded(array $questions): array
    {
        $count = count($questions);
        if ($count === 0) {
            return $questions;
        }

        $hasManualPoints = false;
        foreach ($questions as $q) {
            if (!is_array($q)) {
                continue;
            }
            if (array_key_exists('points', $q) && $q['points'] !== null && $q['points'] !== '') {
                $hasManualPoints = true;
                break;
            }
        }

        if ($hasManualPoints) {
            return $questions;
        }

        if ($count > 100) {
            foreach ($questions as $i => $q) {
                if (!is_array($q)) {
                    continue;
                }
                $questions[$i]['points'] = 1;
            }
            return $questions;
        }

        $base = intdiv(100, $count);
        $remainder = 100 - ($base * $count);
        foreach ($questions as $i => $q) {
            if (!is_array($q)) {
                continue;
            }
            $questions[$i]['points'] = $base + ($i < $remainder ? 1 : 0);
        }

        return $questions;
    }

    protected function normalizeQuestionType(?string $type): string
    {
        $type = strtolower(trim((string) $type));
        $allowed = ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'];

        return in_array($type, $allowed, true) ? $type : 'multiple_choice';
    }
}
