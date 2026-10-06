<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\CourseVersion;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Un curs publicat fără versiune salvată (ex. publicat înainte de versiuni): când adminul începe să-l
 * editeze, cursanții continuă să-i vadă lecțiile și testul (înainte testul devenea „indisponibil”).
 */
class CourseEditingWithoutPublishedVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_learners_keep_access_when_a_course_without_a_published_version_is_edited(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::withoutEvents(fn () => Course::factory()->published()->create(['teacher_id' => $admin->id, 'sequential_unlock' => false]));
        $module = Module::withoutEvents(fn () => Module::create(['course_id' => $course->id, 'title' => 'Modul', 'order' => 1, 'status' => 'published']));
        Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => $module->id, 'title' => 'Lecția publicată',
            'content' => '<p>Conținut</p>', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        $test = Test::factory()->published()->create(['created_by' => $admin->id]);
        Question::factory()->create(['test_id' => $test->id]);
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course', 'required' => true, 'passing_score' => 50, 'order' => 0]);
        DB::table('course_user')->insert([
            'course_id' => $course->id, 'user_id' => $student->id, 'enrolled' => true, 'enrolled_at' => now(),
            'is_mandatory' => false, 'assigned_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame(0, CourseVersion::where('course_id', $course->id)->count());

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}", ['title' => $course->title, 'short_description' => 'Rezumat nou'])
            ->assertOk();
        $this->assertSame('editing', $course->fresh()->workflow_status);

        $this->app['auth']->forgetGuards();
        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$test->id}?course_id={$course->id}")
            ->assertOk();
        $this->app['auth']->forgetGuards();
        $outline = $this->actingAs($student, 'sanctum')->getJson("/api/courses/{$course->id}")->assertOk()->json();
        $this->assertStringContainsString('Lecția publicată', json_encode($outline, JSON_UNESCAPED_UNICODE));
    }
}
