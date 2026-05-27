<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Course;
use App\Services\CourseBuilderService;
use Illuminate\Http\Request;

class LessonAdminController extends Controller
{
    protected CourseBuilderService $courseBuilderService;

    public function __construct(CourseBuilderService $courseBuilderService)
    {
        $this->courseBuilderService = $courseBuilderService;
    }
    public function index(Request $request)
    {
        $query = Lesson::with(['course', 'module']);
        if (auth()->user()->isInstructor()) {
            $query->whereHas('course', fn($q) => $q->where('teacher_id', auth()->id()));
        }
        if ($request->has('course_id')) {
            $query->where('course_id', $request->course_id);
            if (auth()->user()->isInstructor()) {
                $c = Course::find($request->course_id);
                if (!$c || (int) $c->teacher_id !== (int) auth()->id()) {
                    abort(403, 'Acces interzis.');
                }
            }
        }
        if ($request->has('module_id')) {
            $query->where('module_id', $request->module_id);
        }

        $lessons = $query->orderBy('order')->get();

        return response()->json($lessons);
    }

    public function show($id)
    {
        $lesson = Lesson::with(['course', 'module', 'contentBlocks' => fn ($q) => $q->orderBy('order')])
            ->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $lesson->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        return response()->json($lesson);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'nullable|exists:courses,id',
            'module_id' => 'required|exists:modules,id',
            'title' => 'required|string|max:255',
            'content' => 'nullable|string',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:50',
            'duration_minutes' => 'nullable|integer|min:0',
            'order' => 'nullable|integer|min:0',
        ]);

        $module = Module::with('course')->findOrFail($validated['module_id']);
        if (auth()->user()->isInstructor() && (int) $module->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $data = [
            'title' => $validated['title'],
            'content' => $validated['content'] ?? $validated['description'] ?? '',
            'type' => $validated['type'] ?? 'text',
            'duration_minutes' => $validated['duration_minutes'] ?? null,
            'order' => $validated['order'] ?? null,
        ];
        $lesson = $this->courseBuilderService->createLesson($module, $data);

        return response()->json([
            'message' => 'Lecție creată cu succes',
            'lesson' => $lesson->load(['course', 'module']),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $lesson = Lesson::with('course')->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $lesson->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'course_id' => 'nullable|exists:courses,id',
            'module_id' => 'nullable|exists:modules,id',
            'title' => 'sometimes|required|string|max:255',
            'content' => 'nullable|string',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:50',
            'video_url' => 'nullable|string',
            'resources' => 'nullable|array',
            'attachments' => 'nullable|array',
            'duration_minutes' => 'nullable|integer|min:0',
            'order' => 'nullable|integer|min:0',
            'is_preview' => 'nullable|boolean',
            'is_locked' => 'nullable|boolean',
            'unlock_after_lesson_id' => 'nullable|exists:lessons,id',
        ]);

        $updateData = array_filter([
            'course_id' => $validated['course_id'] ?? null,
            'module_id' => $validated['module_id'] ?? null,
            'title' => $validated['title'] ?? null,
            'content' => $validated['content'] ?? $validated['description'] ?? null,
            'type' => $validated['type'] ?? null,
            'video_url' => $validated['video_url'] ?? null,
            'resources' => $validated['resources'] ?? null,
            'attachments' => $validated['attachments'] ?? null,
            'duration_minutes' => $validated['duration_minutes'] ?? null,
            'order' => $validated['order'] ?? null,
            'is_preview' => $validated['is_preview'] ?? null,
            'is_locked' => $validated['is_locked'] ?? null,
            'unlock_after_lesson_id' => $validated['unlock_after_lesson_id'] ?? null,
        ], fn ($v) => $v !== null);
        $lesson = $this->courseBuilderService->updateLesson($lesson, $updateData);

        return response()->json([
            'message' => 'Lecție actualizată cu succes',
            'lesson' => $lesson->load(['course', 'module']),
        ]);
    }

    public function destroy($id)
    {
        $lesson = Lesson::with('course')->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $lesson->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $this->courseBuilderService->deleteLesson($lesson);

        return response()->json([
            'message' => 'Lecție ștearsă cu succes',
        ]);
    }

    /**
     * Reorder lessons in a module
     */
    public function reorder(Request $request, $moduleId)
    {
        $module = Module::with('course')->findOrFail($moduleId);
        if (auth()->user()->isInstructor() && (int) $module->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'lesson_ids' => 'required|array',
            'lesson_ids.*' => 'exists:lessons,id',
        ]);

        // Verify all lessons belong to this module
        $lessons = Lesson::whereIn('id', $validated['lesson_ids'])
            ->where('module_id', $moduleId)
            ->get();

        if ($lessons->count() !== count($validated['lesson_ids'])) {
            return response()->json([
                'message' => 'Unele lecții nu aparțin acestui modul',
            ], 400);
        }

        // Use CourseBuilderService to reorder lessons
        $this->courseBuilderService->reorderLessons($module, $validated['lesson_ids']);

        return response()->json([
            'message' => 'Lecții reordonate cu succes',
            'lessons' => Lesson::where('module_id', $moduleId)->orderBy('order')->get(),
        ]);
    }
}
