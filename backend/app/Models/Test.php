<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Test Model - Standalone assessment entity
 * 
 * Tests are created independently and can be reused across multiple courses
 */
class Test extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'title',
        'description',
        'type',
        'status',
        'time_limit_minutes',
        'max_attempts',
        'passing_score',
        'randomize_questions',
        'randomize_answers',
        'show_results_immediately',
        'show_correct_answers',
        'allow_review',
        'requires_manual_verification',
        'question_set_id',
        'question_source',
        'question_selection',
        'attempts_count',
        'passes_count',
        'average_score',
        'created_by',
        'version',
    ];

    protected $casts = [
        'randomize_questions' => 'boolean',
        'randomize_answers' => 'boolean',
        'show_results_immediately' => 'boolean',
        'show_correct_answers' => 'boolean',
        'allow_review' => 'boolean',
        'requires_manual_verification' => 'boolean',
        'question_selection' => 'array',
        'passing_score' => 'integer',
        'average_score' => 'decimal:2',
    ];

    /**
     * Get the user who created this test
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get questions directly attached to this test
     */
    public function questions()
    {
        return $this->hasMany(Question::class, 'test_id')->orderBy('order');
    }

    /**
     * Get question bank if using question_source = 'bank'
     */
    public function questionBank()
    {
        return $this->belongsTo(QuestionBank::class, 'question_set_id');
    }

    /**
     * Get courses that use this test
     */
    public function courses()
    {
        return $this->belongsToMany(Course::class, 'course_test')
            ->withPivot('scope', 'scope_id', 'required', 'passing_score', 'order')
            ->withTimestamps();
    }

    /**
     * Get test results
     */
    public function results()
    {
        return $this->hasMany(TestResult::class);
    }

    /**
     * Check if test is published
     */
    public function isPublished(): bool
    {
        return $this->status === 'published';
    }

    /**
     * Get total points for this test
     */
    public function getTotalPoints(): int
    {
        if ($this->question_source === 'bank' && $this->questionBank) {
            return $this->questionBank->questions()->sum('points');
        }
        
        return $this->questions()->sum('points');
    }
}

