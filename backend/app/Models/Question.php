<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Question Model
 * 
 * Questions can belong to either a Test (direct) or a QuestionBank (reusable)
 */
class Question extends Model
{
    use HasFactory;

    protected $fillable = [
        'test_id',
        'question_bank_id',
        'type',
        'content',
        'answers',
        'points',
        'order',
        'explanation',
        'metadata',
        'is_starred',
    ];

    protected $casts = [
        'answers' => 'array',
        'metadata' => 'array',
        'is_starred' => 'boolean',
    ];

    /**
     * Get the test this question belongs to (if direct)
     */
    public function test()
    {
        return $this->belongsTo(Test::class);
    }

    /**
     * Get the question bank this question belongs to (if reusable)
     */
    public function questionBank()
    {
        return $this->belongsTo(QuestionBank::class);
    }

    /**
     * Get correct answers
     */
    public function getCorrectAnswers(): array
    {
        if (!$this->answers) {
            return [];
        }

        return array_filter($this->answers, function ($answer) {
            return is_array($answer) && ($answer['is_correct'] ?? false);
        });
    }

    /**
     * Check if answer is correct
     */
    public function isAnswerCorrect($userAnswer): bool
    {
        $correctAnswers = $this->getCorrectAnswers();
        
        if (empty($correctAnswers)) {
            return false;
        }

        // For multiple choice, check if user answer matches any correct answer
        if (in_array($this->type, ['multiple_choice', 'single_choice', 'true_false'], true)) {
            foreach ($correctAnswers as $correct) {
                if (is_array($correct) && ($correct['text'] ?? $correct) === $userAnswer) {
                    return true;
                }
            }
        }

        // For other types, implement specific logic
        return false;
    }
}

