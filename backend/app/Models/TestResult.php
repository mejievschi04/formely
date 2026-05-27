<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * TestResult Model
 * 
 * Results from test attempts (renamed from ExamResult)
 */
class TestResult extends Model
{
    use HasFactory;

    protected $table = 'test_results';

    protected $fillable = [
        'test_id',
        'course_id',
        'user_id',
        'score',
        'max_score',
        'correct_answers_count',
        'total_questions',
        'percentage',
        'passed',
        'time_taken_minutes',
        'attempt_number',
        'answers',
        'started_at',
        'completed_at',
        'reviewed_at',
        'status',
        'needs_manual_review',
        'manual_review_scores',
        'reviewed_by',
    ];

    protected $casts = [
        'passed' => 'boolean',
        'percentage' => 'decimal:2',
        'answers' => 'array',
        'manual_review_scores' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'needs_manual_review' => 'boolean',
    ];

    /**
     * Get the test
     */
    public function test()
    {
        return $this->belongsTo(Test::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * Get the user
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Check if result is passing
     */
    public function isPassing(): bool
    {
        return $this->passed;
    }
}
