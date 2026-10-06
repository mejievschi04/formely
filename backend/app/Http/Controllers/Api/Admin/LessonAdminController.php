<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Models\Module;
use App\Services\CourseBuilderService;
use Illuminate\Http\Request;

class LessonAdminController extends Controller
{
    protected CourseBuilderService $courseBuilderService;

    public function __construct(CourseBuilderService $courseBuilderService)
    {
        $this->courseBuilderService = $courseBuilderService;
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
            'module_id' => 'nullable|integer',
            'unlock_after_lesson_id' => [
                'nullable',
                \Illuminate\Validation\Rule::exists('lessons', 'id')->where(
                    fn ($q) => $q->where('course_id', $lesson->course_id)
                ),
            ],
        ]);

        if ($request->exists('course_id') && (int) $request->input('course_id') !== (int) $lesson->course_id) {
            return response()->json([
                'message' => 'Mutarea lecției în alt curs nu este permisă pe acest endpoint.',
            ], 422);
        }

        if (array_key_exists('module_id', $validated) && $validated['module_id'] !== null) {
            $destination = Module::find($validated['module_id']);
            if (! $destination || (int) $destination->course_id !== (int) $lesson->course_id) {
                return response()->json([
                    'message' => 'Modulul trebuie să aparțină aceluiași curs.',
                ], 422);
            }
        }

        $updateData = [];
        foreach ([
            'title', 'type', 'video_url', 'resources', 'attachments', 'duration_minutes',
            'order', 'is_preview', 'is_locked', 'unlock_after_lesson_id', 'module_id',
        ] as $key) {
            if (array_key_exists($key, $validated)) {
                $updateData[$key] = $validated[$key];
            }
        }
        if (array_key_exists('content', $validated) || array_key_exists('description', $validated)) {
            $updateData['content'] = $validated['content'] ?? $validated['description'] ?? null;
        }
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

}
