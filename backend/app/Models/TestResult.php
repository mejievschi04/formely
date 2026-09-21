<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * TestResult Model
 * 
 * Results from test attempts (renamed from ExamResult)
 */
class TestResult extends Model
{
    use HasFactory;

    protected static ?bool $hasAttemptNumberColumn = null;

    public static function tracksAttemptNumber(): bool
    {
        if (static::$hasAttemptNumberColumn === null) {
            static::$hasAttemptNumberColumn = Schema::hasColumn(
                (new static)->getTable(),
                'attempt_number'
            );
        }

        return static::$hasAttemptNumberColumn;
    }

    public function scopeOrderedByAttempt(Builder $query): Builder
    {
        if (static::tracksAttemptNumber()) {
            return $query->orderByDesc('attempt_number');
        }

        return $query->orderByDesc('id');
    }

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
        'expires_at',
        'completed_at',
        'reviewed_at',
        'status',
        'needs_manual_review',
        'manual_review_scores',
        'reviewed_by',
        'question_snapshot',
        'passing_score_applied',
        'attempt_token',
        'attempt_scope',
    ];

    protected $casts = [
        'passed' => 'boolean',
        'percentage' => 'decimal:2',
        'answers' => 'array',
        'manual_review_scores' => 'array',
        'question_snapshot' => 'array',
        'started_at' => 'datetime',
        'expires_at' => 'datetime',
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
