<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\InvalidatesTutorKnowledgeCache;
use App\Jobs\SyncAiKnowledgeJob;

class Lesson extends Model
{
    use HasFactory;
    use InvalidatesTutorKnowledgeCache;

    protected $fillable = [
        'course_id',
        'module_id',
        'section_id',
        'title',
        'content',
        'video_url',
        'resources',
        'attachments',
        'duration_minutes',
        'type', // video, text, resource
        'status',
        'order',
        'is_preview',
        'is_locked',
        'unlock_after_lesson_id',
        'views_count',
        'completions_count',
        'average_completion_time_minutes',
    ];

    protected $casts = [
        'is_preview' => 'boolean',
        'is_locked' => 'boolean',
        'attachments' => 'array',
        'resources' => 'array',
        'average_completion_time_minutes' => 'decimal:2',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function module()
    {
        return $this->belongsTo(Module::class);
    }

    /**
     * Get course-test links for this lesson
     */
    public function courseTests()
    {
        return $this->hasMany(CourseTest::class, 'scope_id')
            ->where('scope', 'lesson');
    }
    
    /**
     * Get tests linked to this lesson via course_test pivot
     * This is a helper method that returns the actual Test models
     */
    public function getTestsAttribute()
    {
        if (!$this->relationLoaded('courseTests')) {
            $this->load('courseTests.test');
        }
        
        return $this->courseTests->map(function($ct) {
            return $ct->test;
        })->filter();
    }

    /**
     * Get content blocks for this lesson
     */
    public function contentBlocks()
    {
        return $this->hasMany(ContentBlock::class)->orderBy('order');
    }

    /**
     * Boot method to handle events
     */
    protected static function boot()
    {
        parent::boot();

        // Recalculate progress when lesson is updated
        static::saved(function ($lesson) {
            self::clearTutorKnowledgeCache((int) ($lesson->course_id ?? 0));
            SyncAiKnowledgeJob::dispatch((int) $lesson->id, null, 'sync')->onConnection('background');
            if ($lesson->module && $lesson->module->course) {
                app(\App\Services\CourseProgressService::class)
                    ->recalculateCourseProgress($lesson->module->course);
            }
        });

        static::deleted(function ($lesson) {
            self::clearTutorKnowledgeCache((int) ($lesson->course_id ?? 0));
            SyncAiKnowledgeJob::dispatch((int) $lesson->id, null, 'delete')->onConnection('background');
            if ($lesson->module && $lesson->module->course) {
                app(\App\Services\CourseProgressService::class)
                    ->recalculateCourseProgress($lesson->module->course);
            }
        });
    }
}
