<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompanyThrough;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ExamResult extends Model
{
    use BelongsToCompanyThrough, HasFactory;

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
