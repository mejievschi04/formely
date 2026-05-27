<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\InvalidatesTutorKnowledgeCache;
use App\Jobs\SyncAiKnowledgeJob;

/**
 * ContentBlock Model
 * 
 * Conținut reutilizabil decuplat de lecție
 * Conform TODO.md - PAS 3: Adăugare conținut
 */
class ContentBlock extends Model
{
    use HasFactory;
    use InvalidatesTutorKnowledgeCache;

    protected $fillable = [
        'lesson_id',
        'type', // text, video, file, image, gallery, interactive, assignment, etc.
        'source', // URL, file path, or legacy text content
        'metadata', // Additional metadata (duration, size, etc.)
        'payload', // Structured JSON payload for block content (instructiuni.md)
        'language',
        'version',
        'order',
        'visible',
    ];

    protected $casts = [
        'metadata' => 'array',
        'payload' => 'array',
        'visible' => 'boolean',
        'order' => 'integer',
    ];

    /**
     * Get the lesson that owns this content block
     */
    public function lesson()
    {
        return $this->belongsTo(Lesson::class);
    }

    /**
     * Boot method to invalidate tutor cache when content blocks change.
     */
    protected static function boot()
    {
        parent::boot();

        static::saved(function (self $block) {
            $courseId = (int) ($block->lesson?->course_id ?? 0);
            if ($courseId === 0 && $block->lesson_id) {
                $courseId = (int) (Lesson::whereKey($block->lesson_id)->value('course_id') ?? 0);
            }

            self::clearTutorKnowledgeCache($courseId);
            if ($block->lesson_id) {
                SyncAiKnowledgeJob::dispatch((int) $block->lesson_id, null, 'sync')->onConnection('background');
            }
        });

        static::deleted(function (self $block) {
            $courseId = (int) ($block->lesson?->course_id ?? 0);
            if ($courseId === 0 && $block->lesson_id) {
                $courseId = (int) (Lesson::whereKey($block->lesson_id)->value('course_id') ?? 0);
            }

            self::clearTutorKnowledgeCache($courseId);
            if ($block->lesson_id) {
                SyncAiKnowledgeJob::dispatch((int) $block->lesson_id, null, 'sync')->onConnection('background');
            }
        });
    }
}
