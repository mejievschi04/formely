<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\User;
use App\Services\ProgressionEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProgressionEngineUnlockAfterLessonTest extends TestCase
{
    use RefreshDatabase;

    protected ProgressionEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = app(ProgressionEngine::class);
    }

    public function test_lesson_stays_locked_until_prerequisite_lesson_is_completed(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => false]);

        $prerequisite = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție A',
            'content' => '<p>A</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $dependent = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție B',
            'content' => '<p>B</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
            'unlock_after_lesson_id' => $prerequisite->id,
        ]));

        $this->assertFalse($this->engine->isLessonUnlocked($student, $dependent, $course));

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $prerequisite->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertTrue($this->engine->isLessonUnlocked($student, $dependent, $course));
    }

    public function test_unlock_after_lesson_rule_applies_alongside_sequential_unlock(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => true]);

        $module = Module::withoutEvents(fn () => Module::create([
            'course_id' => $course->id,
            'title' => 'Modul 1',
            'order' => 1,
            'status' => 'published',
        ]));

        $lessonOne = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => $module->id,
            'title' => 'Lecție 1',
            'content' => '<p>1</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $prerequisite = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => $module->id,
            'title' => 'Lecție prereq',
            'content' => '<p>P</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 3,
        ]));

        $lessonTwo = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => $module->id,
            'title' => 'Lecție 2',
            'content' => '<p>2</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
            'unlock_after_lesson_id' => $prerequisite->id,
        ]));

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $lessonOne->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertFalse($this->engine->isLessonUnlocked($student, $lessonTwo, $course));

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $prerequisite->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertTrue($this->engine->isLessonUnlocked($student, $lessonTwo, $course));
    }

    public function test_module_stays_locked_until_prerequisite_lesson_is_completed(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => false]);

        $prerequisite = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție prereq',
            'content' => '<p>P</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $module = Module::withoutEvents(fn () => Module::create([
            'course_id' => $course->id,
            'title' => 'Modul blocat',
            'order' => 1,
            'status' => 'published',
            'unlock_after_lesson_id' => $prerequisite->id,
        ]));

        $this->assertFalse($this->engine->isModuleUnlocked($student, $module, $course));

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $prerequisite->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertTrue($this->engine->isModuleUnlocked($student, $module, $course));
    }

    public function test_lesson_access_api_respects_unlock_after_lesson_id(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => false]);

        $prerequisite = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție A',
            'content' => '<p>A</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $dependent = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție B',
            'content' => '<p>B</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
            'unlock_after_lesson_id' => $prerequisite->id,
        ]));

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$dependent->id}/access")
            ->assertOk()
            ->assertJsonPath('unlocked', false);

        DB::table('lesson_progress')->insert([
            'user_id' => $student->id,
            'lesson_id' => $prerequisite->id,
            'completed' => true,
            'progress_percentage' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$dependent->id}/access")
            ->assertOk()
            ->assertJsonPath('unlocked', true);
    }
}
