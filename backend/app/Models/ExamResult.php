<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class ExamResult extends Model
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

    public function resolvedAttemptNumber(): int
    {
        if (! static::tracksAttemptNumber()) {
            return 1;
        }

        return max(1, (int) ($this->attempt_number ?? 1));
    }

    /**
     * @return array<string, mixed>
     */
    public static function attemptAttributesForCreate(int $attemptNumber): array
    {
        if (! static::tracksAttemptNumber()) {
            return [];
        }

        return ['attempt_number' => max(1, $attemptNumber)];
    }

    protected $fillable = [
        'exam_id',
        'user_id',
        'attempt_number',
        'score',
        'total_points',
        'percentage',
        'passed',
        'answers',
        'completed_at',
        'needs_manual_review',
        'manual_review_scores',
        'reviewed_at',
        'reviewed_by',
    ];

    protected $casts = [
        'answers' => 'array',
        'passed' => 'boolean',
        'completed_at' => 'datetime',
        'needs_manual_review' => 'boolean',
        'manual_review_scores' => 'array',
        'reviewed_at' => 'datetime',
    ];

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
