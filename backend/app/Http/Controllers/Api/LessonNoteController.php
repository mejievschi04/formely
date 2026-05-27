<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Models\LessonNote;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LessonNoteController extends Controller
{
    public function show(Request $request, int $lessonId)
    {
        /** @var User $user */
        $user = $request->user();
        $lesson = Lesson::query()->findOrFail($lessonId);
        if (! $this->userCanManageLessonNotes($user, $lesson)) {
            return response()->json(['message' => 'Nu ai acces la această lecție.'], 403);
        }
        if (! Schema::hasTable('lesson_notes')) {
            return response()->json(['notes' => []]);
        }
        $row = LessonNote::query()->where('user_id', $user->id)->where('lesson_id', $lessonId)->first();

        return response()->json(['notes' => is_array($row?->notes) ? $row->notes : []]);
    }

    public function update(Request $request, int $lessonId)
    {
        /** @var User $user */
        $user = $request->user();
        $lesson = Lesson::query()->findOrFail($lessonId);
        if (! $this->userCanManageLessonNotes($user, $lesson)) {
            return response()->json(['message' => 'Nu ai acces la această lecție.'], 403);
        }
        if (! Schema::hasTable('lesson_notes')) {
            return response()->json(['message' => 'Notițele nu sunt activate pe server.'], 503);
        }

        $validated = $request->validate([
            'notes' => 'required|array|max:500',
            'notes.*.content' => 'nullable|string|max:50000',
            'notes.*.timestamp' => 'nullable|numeric',
            'notes.*.id' => 'nullable',
            'notes.*.createdAt' => 'nullable|string',
            'notes.*.updatedAt' => 'nullable|string',
        ]);

        LessonNote::query()->updateOrCreate(
            ['user_id' => $user->id, 'lesson_id' => $lessonId],
            ['notes' => $validated['notes']]
        );

        return response()->json(['ok' => true, 'notes' => $validated['notes']]);
    }

    protected function userCanManageLessonNotes(User $user, Lesson $lesson): bool
    {
        if ($user->isAdmin()) {
            return true;
        }
        if ($lesson->is_preview) {
            return true;
        }
        $course = $lesson->course;
        if (! $course) {
            return false;
        }
        if ($user->isInstructor() && (int) $course->teacher_id === (int) $user->id) {
            return true;
        }

        return DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('course_id', $course->id)
            ->where('enrolled', true)
            ->exists();
    }
}
