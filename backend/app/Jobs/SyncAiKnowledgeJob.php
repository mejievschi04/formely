<?php

namespace App\Jobs;

use App\Models\Course;
use App\Models\Lesson;
use App\Services\AIKnowledgeService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SyncAiKnowledgeJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $timeout = 180;

    public function __construct(
        public ?int $lessonId = null,
        public ?int $courseId = null,
        public string $action = 'sync'
    ) {
    }

    public function handle(AIKnowledgeService $service): void
    {
        if ($this->action === 'delete' && $this->lessonId) {
            $service->deleteLessonIndex($this->lessonId);
            return;
        }

        if ($this->lessonId) {
            $lesson = Lesson::with(['course', 'module', 'contentBlocks'])->find($this->lessonId);
            if ($lesson) {
                $service->rebuildLessonIndex($lesson);
            }
            return;
        }

        if ($this->courseId) {
            $course = Course::with([
                'modules.lessons.contentBlocks',
                'lessons.contentBlocks',
            ])->find($this->courseId);

            if ($course) {
                $service->rebuildCourseIndex($course);
            }
        }
    }
}
