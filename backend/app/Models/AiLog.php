<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AiLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'course_id',
        'lesson_id',
        'mode',
        'intent',
        'provider',
        'model',
        'status',
        'prompt',
        'response',
        'context_chunks',
        'metadata',
        'latency_ms',
        'prompt_hash',
    ];

    protected $casts = [
        'context_chunks' => 'array',
        'metadata' => 'array',
        'latency_ms' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function lesson()
    {
        return $this->belongsTo(Lesson::class);
    }
}
