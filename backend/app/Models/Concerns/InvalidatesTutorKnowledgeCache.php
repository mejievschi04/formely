<?php

namespace App\Models\Concerns;

use App\Jobs\SyncAiKnowledgeJob;
use App\Support\VoltAvailability;
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

    /**
     * Reindexează cunoștințele Volt în fundal, doar dacă Volt e configurat.
     * Fără cheie AI, fiecare salvare ar porni degeaba un proces cu apeluri care eșuează.
     * După activarea Volt: php artisan ai:reindex-knowledge
     */
    protected static function queueKnowledgeSync(?int $lessonId, ?int $courseId, string $action = 'sync'): void
    {
        if (! VoltAvailability::isConfigured()) {
            return;
        }

        SyncAiKnowledgeJob::dispatch($lessonId, $courseId, $action)->onConnection('background');
    }
}
