<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\Course;
use App\Services\CourseBuilderService;
use Illuminate\Http\Request;
use App\Support\SchemaCache;

class ModuleAdminController extends Controller
{
    protected CourseBuilderService $courseBuilderService;

    public function __construct(CourseBuilderService $courseBuilderService)
    {
        $this->courseBuilderService = $courseBuilderService;
    }
    public function show($id)
    {
        $module = Module::with(['course', 'lessons' => function($q) {
            $q->orderBy('order');
        }])->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $module->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        return response()->json($module);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'content' => 'nullable|string',
            'order' => 'nullable|integer|min:0',
        ]);

        $course = Course::findOrFail($validated['course_id']);
        if (auth()->user()->isInstructor() && (int) $course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $module = $this->courseBuilderService->createModule($course, $validated);

        return response()->json([
            'message' => 'Modul creat cu succes',
            'module' => $module->load('course'),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $module = Module::with('course')->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $module->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'content' => 'nullable|string',
            'order' => 'nullable|integer|min:0',
            'status' => 'nullable|string|in:draft,published',
            'is_locked' => 'nullable|boolean',
            'unlock_after_module_id' => 'nullable|integer',
            'unlock_after_lesson_id' => 'nullable|integer',
            'estimated_duration_minutes' => 'nullable|integer|min:0',
        ]);

        if ($request->exists('course_id') && (int) $request->input('course_id') !== (int) $module->course_id) {
            return response()->json([
                'message' => 'Mutarea modulului în alt curs nu este permisă pe acest endpoint.',
            ], 422);
        }

        // Filter to only columns that exist and are fillable
        $updateData = [];
        $allowed = ['course_id', 'title', 'description', 'content', 'order', 'status', 'is_locked',
            'unlock_after_module_id', 'unlock_after_lesson_id', 'estimated_duration_minutes'];
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $validated)) {
                continue;
            }
            if (SchemaCache::hasColumn('modules', $key)) {
                $updateData[$key] = $validated[$key];
            }
        }

        if (empty($updateData)) {
            return response()->json([
                'message' => 'Modul actualizat cu succes',
                'module' => $module->load('course'),
            ]);
        }

        $module = $this->courseBuilderService->updateModule($module, $updateData);

        return response()->json([
            'message' => 'Modul actualizat cu succes',
            'module' => $module->load('course'),
        ]);
    }

    public function destroy($id)
    {
        $module = Module::with('course')->findOrFail($id);
        if (auth()->user()->isInstructor() && (int) $module->course->teacher_id !== (int) auth()->id()) {
            abort(403, 'Acces interzis.');
        }
        $this->courseBuilderService->deleteModule($module);

        return response()->json([
            'message' => 'Modul șters cu succes',
        ]);
    }

}
