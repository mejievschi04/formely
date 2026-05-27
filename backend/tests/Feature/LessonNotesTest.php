<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonNote;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LessonNotesTest extends TestCase
{
    use RefreshDatabase;

    protected function createPublishedCourseWithLesson(): array
    {
        $teacher = User::factory()->create(['role' => 'instructor']);

        $course = Course::withoutEvents(function () use ($teacher) {
            return Course::factory()->published()->create([
                'teacher_id' => $teacher->id,
                'access_type' => 'free',
                'enrollment_type' => 'open',
            ]);
        });

        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'Modul 1',
                'description' => null,
                'order' => 1,
                'status' => 'published',
            ]);
        });

        $lesson = Lesson::withoutEvents(function () use ($course, $module) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => $module->id,
                'title' => 'Lecție test notițe',
                'content' => '<p>Conținut</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
                'is_preview' => false,
            ]);
        });

        return [$course, $lesson, $teacher];
    }

    public function test_guest_cannot_read_lesson_notes(): void
    {
        [, $lesson] = $this->createPublishedCourseWithLesson();

        $this->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertUnauthorized();
    }

    public function test_enrolled_student_can_get_empty_notes_and_save_then_read(): void
    {
        [, $lesson] = $this->createPublishedCourseWithLesson();
        $course = $lesson->course;

        $student = User::factory()->create(['role' => 'student']);

        DB::table('course_user')->insert([
            'course_id' => $course->id,
            'user_id' => $student->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertOk()
            ->assertJsonPath('notes', []);

        $notesPayload = [
            'notes' => [
                [
                    'id' => 1001,
                    'timestamp' => 12.5,
                    'content' => 'Punct important la 12s',
                    'createdAt' => '2026-04-23T10:00:00.000Z',
                    'updatedAt' => '2026-04-23T10:00:00.000Z',
                ],
            ],
        ];

        $this->actingAs($student, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/notes", $notesPayload)
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('notes.0.content', 'Punct important la 12s');

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertOk()
            ->assertJsonPath('notes.0.content', 'Punct important la 12s');

        $this->assertDatabaseHas('lesson_notes', [
            'user_id' => $student->id,
            'lesson_id' => $lesson->id,
        ]);

        $row = LessonNote::query()->where('user_id', $student->id)->where('lesson_id', $lesson->id)->first();
        $this->assertIsArray($row->notes);
        $this->assertCount(1, $row->notes);
    }

    public function test_unenrolled_student_gets_403_on_lesson_notes(): void
    {
        [, $lesson] = $this->createPublishedCourseWithLesson();

        $stranger = User::factory()->create(['role' => 'student']);

        $this->actingAs($stranger, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertForbidden();
    }

    public function test_course_teacher_can_read_and_write_notes_without_enrollment_row(): void
    {
        [$course, $lesson, $teacher] = $this->createPublishedCourseWithLesson();

        $this->actingAs($teacher, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertOk()
            ->assertJsonPath('notes', []);

        $this->actingAs($teacher, 'sanctum')
            ->putJson("/api/lessons/{$lesson->id}/notes", [
                'notes' => [
                    ['id' => 1, 'timestamp' => 0, 'content' => 'Privat instructor', 'createdAt' => now()->toIso8601String(), 'updatedAt' => now()->toIso8601String()],
                ],
            ])
            ->assertOk();

        $this->assertDatabaseHas('lesson_notes', [
            'user_id' => $teacher->id,
            'lesson_id' => $lesson->id,
        ]);
    }

    public function test_preview_lesson_notes_allowed_for_any_authenticated_user(): void
    {
        $teacher = User::factory()->create(['role' => 'instructor']);
        $course = Course::withoutEvents(function () use ($teacher) {
            return Course::factory()->published()->create([
                'teacher_id' => $teacher->id,
            ]);
        });
        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'M',
                'order' => 1,
                'status' => 'published',
            ]);
        });
        $lesson = Lesson::withoutEvents(function () use ($course, $module) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => $module->id,
                'title' => 'Preview',
                'content' => 'x',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
                'is_preview' => true,
            ]);
        });

        $visitor = User::factory()->create(['role' => 'student']);

        $this->actingAs($visitor, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/notes")
            ->assertOk();
    }
}
