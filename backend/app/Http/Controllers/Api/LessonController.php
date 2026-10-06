<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Services\PublishedCourseView;
use App\Support\LearningVisibility;
use Illuminate\Http\Request;
use App\Support\SchemaCache;

class LessonController extends Controller
{
    public function show(Request $request, $id)
    {
        $isStaff = LearningVisibility::isStaffRequest($request);

		$query = Lesson::with([
            'course',
            'module.course',
            'contentBlocks' => function ($q) {
                $q->orderBy('order')
                    ->where(function ($q) {
                        $q->where('visible', true)->orWhereNull('visible');
                    });
            },
        ]);

        if (! $isStaff) {
            if (SchemaCache::hasColumn('lessons', 'status')) {
                $query->where('status', 'published');
            }
            if (SchemaCache::hasColumn('courses', 'status')) {
                $query->whereHas('course', fn ($c) => $c->where('status', 'published'));
            }
        }

        $lesson = $query->find($id);
        $view = app(PublishedCourseView::class);
        if (! $lesson) {
            $lesson = $view->hydratePublishedLesson((int) $id, $request);
            if (! $lesson) {
                abort(404);
            }
        } elseif ($view->shouldServeSnapshot($lesson->course, $request)) {
            $overlay = $view->overlayLesson(
                $lesson,
                $view->latestPublishedSnapshot((int) $lesson->course_id)
            );
            if (! $overlay) {
                abort(404);
            }
            $lesson = $overlay;
        }

        if (! LearningVisibility::learnerMaySeeLessonBody($request->user(), $lesson, $lesson->course)) {
            return response()->json([
                'message' => 'Nu ai acces la această lecție.',
                'title' => $lesson->title,
            ], 403);
        }

        $user = $request->user();
        $course = $lesson->module?->course ?: $lesson->course;
        if (
            $user
            && ! LearningVisibility::isStaff($user)
            && ! (bool) ($lesson->is_preview ?? false)
            && $course
            && ! app(\App\Services\CourseProgressService::class)->isLessonUnlocked(
                $user,
                $lesson,
                $lesson->module,
                $course
            )
        ) {
            return response()->json([
                'message' => 'Lecția este blocată. Completează lecțiile anterioare.',
                'locked' => true,
                'title' => $lesson->title,
            ], 403);
        }

        return response()->json($lesson);
    }
}

