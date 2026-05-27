<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Migrate existing exam data to new test structure
     */
    public function up(): void
    {
        if (!Schema::hasTable('exams')) {
            return; // No exams to migrate
        }
        
        // Create tests table if it doesn't exist (should exist from previous migration)
        if (!Schema::hasTable('tests')) {
            return;
        }
        
        // Migrate exams to tests
        $exams = DB::table('exams')->get();
        
        foreach ($exams as $exam) {
            // Determine test type based on exam context
            $testType = 'graded';
            if ($exam->is_required ?? false) {
                $testType = 'final';
            }
            
            // Insert into tests table
            $testId = DB::table('tests')->insertGetId([
                'title' => $exam->title,
                'description' => $exam->description ?? null,
                'type' => $testType,
                'status' => $exam->status ?? 'draft',
                'time_limit_minutes' => $exam->time_limit_minutes ?? null,
                'max_attempts' => $exam->max_attempts ?? null,
                'randomize_questions' => false,
                'randomize_answers' => false,
                'show_results_immediately' => true,
                'show_correct_answers' => false,
                'allow_review' => true,
                'question_source' => 'direct',
                'attempts_count' => $exam->attempts_count ?? 0,
                'passes_count' => $exam->passes_count ?? 0,
                'average_score' => $exam->average_score ?? null,
                'created_by' => 1, // Default to first user, adjust if needed
                'version' => '1.0.0',
                'created_at' => $exam->created_at ?? now(),
                'updated_at' => $exam->updated_at ?? now(),
            ]);
            
            // Migrate exam_questions to questions
            if (Schema::hasTable('exam_questions')) {
                $questions = DB::table('exam_questions')
                    ->where('exam_id', $exam->id)
                    ->get();
                
                foreach ($questions as $question) {
                    // Get answers for this question
                    $answers = [];
                    if (Schema::hasTable('exam_answers')) {
                        $examAnswers = DB::table('exam_answers')
                            ->where('exam_question_id', $question->id)
                            ->orderBy('order')
                            ->get();
                        
                        foreach ($examAnswers as $answer) {
                            $answers[] = [
                                'text' => $answer->answer_text,
                                'is_correct' => $answer->is_correct,
                                'order' => $answer->order,
                            ];
                        }
                    }
                    
                    // Determine question type (default to multiple_choice)
                    $questionType = $question->question_type ?? 'multiple_choice';
                    
                    DB::table('questions')->insert([
                        'test_id' => $testId,
                        'question_bank_id' => null,
                        'type' => $questionType,
                        'content' => $question->question_text,
                        'answers' => json_encode($answers),
                        'points' => $question->points ?? 1,
                        'order' => $question->order ?? 0,
                        'explanation' => null,
                        'metadata' => null,
                        'created_at' => $question->created_at ?? now(),
                        'updated_at' => $question->updated_at ?? now(),
                    ]);
                }
            }
            
            // Create course_test links
            if ($exam->course_id) {
                $scope = 'course';
                $scopeId = null;
                
                if ($exam->module_id) {
                    $scope = 'module';
                    $scopeId = $exam->module_id;
                } elseif ($exam->lesson_id) {
                    $scope = 'lesson';
                    $scopeId = $exam->lesson_id;
                }
                
                DB::table('course_test')->insert([
                    'course_id' => $exam->course_id,
                    'test_id' => $testId,
                    'scope' => $scope,
                    'scope_id' => $scopeId,
                    'required' => $exam->is_required ?? false,
                    'passing_score' => $exam->passing_score ?? 70,
                    'order' => 0,
                    'unlock_after_previous' => false,
                    'unlock_after_test_id' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            
            // Update test_results to reference new test_id
            if (Schema::hasTable('test_results')) {
                DB::table('test_results')
                    ->where('test_id', $exam->id) // This will be updated after migration
                    ->update(['test_id' => $testId]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This migration is one-way for data migration
        // The old exams table structure should be preserved for rollback
    }
};

