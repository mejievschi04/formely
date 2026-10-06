<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExamAttemptSession extends Model
{
    protected $fillable = [
        'exam_id',
        'user_id',
        'attempt_number',
        'question_snapshot',
        'answers',
        'started_at',
        'expires_at',
    ];

    protected $casts = [
        'question_snapshot' => 'array',
        'answers' => 'array',
        'started_at' => 'datetime',
        'expires_at' => 'datetime',
    ];
}
