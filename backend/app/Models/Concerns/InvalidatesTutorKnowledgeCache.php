<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Cache;

trait InvalidatesTutorKnowledgeCache
{
    protected static function clearTutorKnowledgeCache(?int $courseId = null): void
    {
        Cache::forget('tutor_course_catalog:published');
        Cache::forget('tutor_course_catalog:all');
        Cache::forget('tutor_lesson_index:published');
        Cache::forget('tutor_lesson_index:all');

        if ($courseId) {
            Cache::forget("tutor_course_detail:{$courseId}");
        }
    }
}
