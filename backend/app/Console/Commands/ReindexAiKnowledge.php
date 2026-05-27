<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\Lesson;
use App\Services\AIKnowledgeService;
use Illuminate\Console\Command;

class ReindexAiKnowledge extends Command
{
    protected $signature = 'ai:reindex-knowledge {--courseId=} {--lessonId=} {--no-embeddings}';
    protected $description = 'Rebuild AI knowledge chunks and embeddings for courses or lessons.';

    public function handle(AIKnowledgeService $service): int
    {
        $refreshEmbeddings = !$this->option('no-embeddings');
        $courseId = $this->option('courseId');
        $lessonId = $this->option('lessonId');

        if ($lessonId) {
            $lesson = Lesson::with(['course', 'module', 'contentBlocks'])->find((int) $lessonId);
            if (!$lesson) {
                $this->error("Lesson {$lessonId} not found.");
                return self::FAILURE;
            }

            $result = $service->rebuildLessonIndex($lesson, $refreshEmbeddings);
            $this->info('Reindexed lesson ' . $lesson->id . ': ' . json_encode($result));
            return self::SUCCESS;
        }

        if ($courseId) {
            $course = Course::with(['modules.lessons.contentBlocks', 'lessons.contentBlocks'])->find((int) $courseId);
            if (!$course) {
                $this->error("Course {$courseId} not found.");
                return self::FAILURE;
            }

            $result = $service->rebuildCourseIndex($course, $refreshEmbeddings);
            $this->info('Reindexed course ' . $course->id . ': ' . json_encode($result));
            return self::SUCCESS;
        }

        $count = 0;
        Course::query()->select('id')->orderBy('id')->chunkById(20, function ($courses) use (&$count, $service, $refreshEmbeddings) {
            foreach ($courses as $course) {
                $fullCourse = Course::with(['modules.lessons.contentBlocks', 'lessons.contentBlocks'])->find($course->id);
                if (!$fullCourse) {
                    continue;
                }

                $result = $service->rebuildCourseIndex($fullCourse, $refreshEmbeddings);
                $count += (int) ($result['lessons_indexed'] ?? 0);
                $this->line('Reindexed course ' . $fullCourse->id . ': ' . json_encode($result));
            }
        });

        $this->info('Completed reindexing. Lessons processed: ' . $count);
        return self::SUCCESS;
    }
}
