<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\User;
use App\Services\DripContentService;
use App\Services\ProgressionEngine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DripContentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_daily_drip_unlocks_lessons_by_enrollment_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-29 12:00:00'));

        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create([
            'sequential_unlock' => false,
            'drip_content' => true,
            'drip_schedule' => 'daily',
        ]);

        $module = Module::withoutEvents(fn () => Module::create([
            'course_id' => $course->id,
            'title' => 'Modul 1',
            'order' => 1,
            'status' => 'published',
        ]));

        $lessonOne = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => $module->id,
            'title' => 'Ziua 0',
            'content' => '<p>1</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $lessonTwo = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'module_id' => $module->id,
            'title' => 'Ziua 1',
            'content' => '<p>2</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
        ]));

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => Carbon::parse('2026-05-29 08:00:00'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $engine = app(ProgressionEngine::class);

        $this->assertTrue($engine->isLessonUnlocked($student, $lessonOne, $course));
        $this->assertFalse($engine->isLessonUnlocked($student, $lessonTwo, $course));

        Carbon::setTestNow(Carbon::parse('2026-05-30 08:00:00'));
        $this->assertTrue($engine->isLessonUnlocked($student, $lessonTwo, $course));

        Carbon::setTestNow();
    }

    public function test_custom_drip_schedule_supports_json_interval(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-01 10:00:00'));

        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create([
            'sequential_unlock' => false,
            'drip_content' => true,
            'drip_schedule' => json_encode(['type' => 'custom', 'interval_days' => 3]),
        ]);

        $lessonOne = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'L1',
            'content' => '<p>1</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $lessonTwo = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'L2',
            'content' => '<p>2</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
        ]));

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => Carbon::parse('2026-06-01 00:00:00'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $service = app(DripContentService::class);
        $enrolledAt = $service->getEnrolledAt($student, $course);

        $this->assertTrue($service->isLessonReleased($student, $course, $lessonOne));
        $this->assertFalse($service->isLessonReleased($student, $course, $lessonTwo));
        $this->assertTrue(
            $service->getLessonUnlockAt($course, $lessonTwo, $enrolledAt)->equalTo(Carbon::parse('2026-06-04 00:00:00'))
        );

        Carbon::setTestNow();
    }

    public function test_lesson_access_api_includes_drip_unlock_at(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-29 12:00:00'));

        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create([
            'sequential_unlock' => false,
            'drip_content' => true,
            'drip_schedule' => 'weekly',
        ]);

        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție drip',
            'content' => '<p>x</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 2,
        ]));

        Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție 1',
            'content' => '<p>1</p>',
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => Carbon::parse('2026-05-29 00:00:00'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}/access")
            ->assertOk()
            ->assertJsonPath('unlocked', false)
            ->assertJsonPath('drip_unlock_at', Carbon::parse('2026-06-05 00:00:00')->toIso8601String());

        Carbon::setTestNow();
    }
}
