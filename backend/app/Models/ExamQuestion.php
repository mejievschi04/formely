<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ExamQuestion extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'question_text',
        'question_type',
        'order',
        'points',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    /** Questions are auto-graded in the current flow. */
    public function requiresManualGrading(): bool
    {
        return false;
    }

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function answers()
    {
        return $this->hasMany(ExamAnswer::class)->orderBy('order');
    }
}
