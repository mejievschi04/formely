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

    public function requiresManualGrading(): bool
    {
        $auto = ['multiple_choice', 'single_choice', 'true_false', 'matching', 'ordering'];

        return ! in_array((string) ($this->question_type ?? 'multiple_choice'), $auto, true);
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
