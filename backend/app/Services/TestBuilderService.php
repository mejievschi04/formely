<?php

namespace App\Services;

use App\Models\Test;
use App\Models\Question;
use App\Models\QuestionBank;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TestBuilderService
 * 
 * Handles standalone test creation and management
 * Separated from course logic
 * Focus: Assessment & Questions
 */
class TestBuilderService
{
    /**
     * Create a new test
     */
    public function createTest(array $data, User $creator): Test
    {
        $insert = [
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'type' => 'final',
            'status' => $data['status'] ?? 'draft',
            'time_limit_minutes' => $data['time_limit_minutes'] ?? null,
            'max_attempts' => $data['max_attempts'] ?? null,
            'passing_score' => isset($data['passing_score']) ? (int) $data['passing_score'] : 70,
            'randomize_questions' => (bool)($data['randomize_questions'] ?? false),
            'randomize_answers' => (bool)($data['randomize_answers'] ?? false),
            'show_results_immediately' => (bool)($data['show_results_immediately'] ?? true),
            'show_correct_answers' => (bool)($data['show_correct_answers'] ?? false),
            'allow_review' => (bool)($data['allow_review'] ?? true),
            'requires_manual_verification' => (bool)($data['requires_manual_verification'] ?? false),
            'question_source' => $data['question_source'] ?? 'direct',
            'question_set_id' => !empty($data['question_set_id']) ? (int)$data['question_set_id'] : null,
            'created_by' => $creator->id,
            'version' => $data['version'] ?? '1.0.0',
        ];

        if (Schema::hasColumn('tests', 'question_selection')) {
            $insert['question_selection'] = isset($data['question_selection'])
                ? $this->normalizeQuestionSelection($data['question_selection'])
                : null;
        }

        $test = Test::create($insert);

        // Add questions if provided
        if (isset($data['questions']) && is_array($data['questions'])) {
            $this->addQuestionsToTest($test, $data['questions']);
        }

        return $test;
    }

    /**
     * Update a test
     */
    public function updateTest(Test $test, array $data): Test
    {
        // Prevent updating published tests that are in use
        if ($test->status === 'published') {
            $usageCount = DB::table('course_test')
                ->where('test_id', $test->id)
                ->count();

            if ($usageCount > 0 && isset($data['questions'])) {
                throw new \Exception('Cannot modify questions of a published test that is linked to courses. Create a new version instead.');
            }
        }

        // Extract questions from data if present
        $questions = $data['questions'] ?? null;
        unset($data['questions']);

        // Filtrează doar coloanele care există în tabel (evită "Undefined column")
        $table = $test->getTable();
        $updateData = [];
        foreach ($data as $key => $value) {
            if (Schema::hasColumn($table, $key)) {
                if ($key === 'question_selection') {
                    $value = $this->normalizeQuestionSelection($value);
                }
                $updateData[$key] = $value;
            }
        }

        // question_set_id: asigură int sau null
        if (array_key_exists('question_set_id', $updateData) && empty($updateData['question_set_id'])) {
            $updateData['question_set_id'] = null;
        } elseif (isset($updateData['question_set_id'])) {
            $updateData['question_set_id'] = (int) $updateData['question_set_id'];
        }

        $test->update($updateData);
        
        // Refresh to get updated question_source if it was changed
        $test->refresh();

        // Handle questions update if provided and test uses direct questions
        if ($questions !== null && $test->question_source === 'direct') {
            // Delete existing questions
            $test->questions()->delete();
            
            // Add new questions
            if (!empty($questions)) {
                $this->addQuestionsToTest($test, $questions);
            }
        }

        return $test->fresh();
    }

    /**
     * Add questions to a test
     */
    public function addQuestionsToTest(Test $test, array $questions): void
    {
        if ($test->question_source === 'bank') {
            throw new \Exception('Cannot add direct questions to a test that uses a question bank');
        }

        $questions = $this->applyDefaultPointsIfNeeded($questions);

        foreach ($questions as $index => $questionData) {
            Question::create([
                'test_id' => $test->id,
                'question_bank_id' => null,
                'type' => $this->normalizeQuestionType($questionData['type'] ?? 'multiple_choice'),
                'content' => $questionData['content'],
                'answers' => $this->normalizeAnswersForType($questionData['type'] ?? 'multiple_choice', $questionData['answers'] ?? []),
                'points' => isset($questionData['points']) && $questionData['points'] !== '' ? (int) $questionData['points'] : 1,
                'order' => $questionData['order'] ?? $index,
                'explanation' => $questionData['explanation'] ?? null,
                'metadata' => $questionData['metadata'] ?? null,
            ]);
        }
    }

    /**
     * Update a question
     */
    public function updateQuestion(Question $question, array $data): Question
    {
        // Check if question belongs to a published test that's in use
        if ($question->test && $question->test->status === 'published') {
            $usageCount = DB::table('course_test')
                ->where('test_id', $question->test_id)
                ->count();

            if ($usageCount > 0) {
                throw new \Exception('Cannot modify questions of a published test that is linked to courses. Create a new version instead.');
            }
        }

        if (isset($data['answers']) && is_array($data['answers'])) {
            $data['answers'] = $this->normalizeAnswersForType($data['type'] ?? $question->type ?? 'multiple_choice', $data['answers']);
        }

        $question->update($data);
        return $question->fresh();
    }

    /**
     * Delete a question
     */
    public function deleteQuestion(Question $question): bool
    {
        // Check if question belongs to a published test that's in use
        if ($question->test && $question->test->status === 'published') {
            $usageCount = DB::table('course_test')
                ->where('test_id', $question->test_id)
                ->count();

            if ($usageCount > 0) {
                throw new \Exception('Cannot delete questions from a published test that is linked to courses.');
            }
        }

        return $question->delete();
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

        if ($test->question_source === 'bank' && $test->questionBank->questions()->count() === 0) {
            throw new \Exception('Cannot publish test with empty question bank');
        }

        $test->update(['status' => 'published']);
        return $test->fresh();
    }

    /**
     * Unpublish a test
     */
    public function unpublishTest(Test $test): Test
    {
        // Check if test is linked to courses
        $usageCount = DB::table('course_test')
            ->where('test_id', $test->id)
            ->count();

        if ($usageCount > 0) {
            throw new \Exception('Cannot unpublish test that is linked to courses. Unlink it first.');
        }

        $test->update(['status' => 'draft']);
        return $test->fresh();
    }

    /**
     * Delete a test (soft delete).
     * Elimină mai întâi legăturile din course_test; altfel testul rămâne referit de cursuri
     * iar soft delete nu declanșează CASCADE la nivel de FK.
     */
    public function deleteTest(Test $test): bool
    {
        return DB::transaction(function () use ($test) {
            if (Schema::hasTable('course_test')) {
                DB::table('course_test')->where('unlock_after_test_id', $test->id)->update(['unlock_after_test_id' => null]);
                DB::table('course_test')->where('test_id', $test->id)->delete();
            }

            return $test->delete();
        });
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
                'answers' => $this->normalizeAnswersForType($questionData['type'] ?? 'multiple_choice', $questionData['answers'] ?? []),
                'points' => isset($questionData['points']) && $questionData['points'] !== '' ? (int) $questionData['points'] : 1,
                'order' => $questionData['order'] ?? $index,
                'explanation' => $questionData['explanation'] ?? null,
                'metadata' => $questionData['metadata'] ?? null,
            ]);
        }
    }

    /**
     * Create a new version of a test
     */
    public function createTestVersion(Test $test, User $creator): Test
    {
        $newTest = $test->replicate();
        $newTest->title = $test->title . ' (v' . $test->version . ')';
        $newTest->status = 'draft';
        $newTest->version = $this->incrementVersion($test->version);
        $newTest->created_by = $creator->id;
        $newTest->save();

        // Copy questions if direct
        if ($test->question_source === 'direct') {
            foreach ($test->questions as $question) {
                $newQuestion = $question->replicate();
                $newQuestion->test_id = $newTest->id;
                $newQuestion->question_bank_id = null;
                $newQuestion->type = $this->normalizeQuestionType($newQuestion->type ?? 'multiple_choice');
                $newQuestion->save();
            }
        } else {
            // Link to same question bank
            $newTest->question_set_id = $test->question_set_id;
            $newTest->save();
        }

        return $newTest;
    }

    /**
     * Increment version string (e.g., "1.0.0" -> "1.0.1")
     */
    protected function incrementVersion(string $version): string
    {
        $parts = explode('.', $version);
        $lastIndex = count($parts) - 1;
        $parts[$lastIndex] = (int)$parts[$lastIndex] + 1;
        return implode('.', $parts);
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
            // Fallback: păstrăm minim 1 punct/întrebare (nu putem împărți 100 în int >=1 la >100 întrebări)
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

    protected function normalizeQuestionSelection($selection): ?array
    {
        if (!is_array($selection)) {
            return null;
        }

        $normalized = $selection;
        if (!array_key_exists('include_starred', $normalized)) {
            $normalized['include_starred'] = true;
        } else {
            $normalized['include_starred'] = (bool) $normalized['include_starred'];
        }

        if (isset($normalized['count'])) {
            $normalized['count'] = max(0, (int) $normalized['count']);
        }

        if (isset($normalized['folder_ids']) && is_array($normalized['folder_ids'])) {
            $normalized['folder_ids'] = array_values(array_unique(array_filter(array_map('intval', $normalized['folder_ids']))));
        }

        return $normalized;
    }

    protected function normalizeQuestionType(?string $type): string
    {
        $type = strtolower(trim((string) $type));
        $allowed = ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'];

        return in_array($type, $allowed, true) ? $type : 'multiple_choice';
    }

    protected function normalizeAnswersForType(?string $questionType, array $answers): array
    {
        $type = $this->normalizeQuestionType($questionType);
        $normalized = [];

        foreach (array_values($answers) as $idx => $item) {
            $row = is_array($item) ? $item : [];

            if ($type === 'matching') {
                $left = $row['left'] ?? $row['text'] ?? $row['question'] ?? '';
                $right = $row['right'] ?? $row['answer_text'] ?? $row['content'] ?? '';
                $left = is_string($left) ? $left : (string) $left;
                $right = is_string($right) ? $right : (string) $right;

                $normalized[] = [
                    'left' => $left,
                    'right' => $right,
                    'text' => $left,
                    'answer_text' => $right,
                    'is_correct' => true,
                    'order' => $idx,
                ];
                continue;
            }

            if ($type === 'ordering') {
                $text = $row['text'] ?? $row['answer_text'] ?? $row['content'] ?? $row['label'] ?? '';
                $normalized[] = [
                    'text' => is_string($text) ? $text : (string) $text,
                    'is_correct' => true,
                    'order' => $idx,
                ];
                continue;
            }

            $text = $row['text'] ?? $row['answer_text'] ?? $row['content'] ?? '';
            $normalized[] = [
                'text' => is_string($text) ? $text : (string) $text,
                'is_correct' => filter_var($row['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'order' => isset($row['order']) ? (int) $row['order'] : $idx,
            ];
        }

        return $normalized;
    }
}
