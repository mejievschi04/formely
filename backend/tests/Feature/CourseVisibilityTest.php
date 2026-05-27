<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_cannot_view_draft_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->create(['status' => 'draft']);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}")
            ->assertNotFound();
    }

    public function test_student_can_view_published_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('id', $course->id);
    }

    public function test_student_cannot_view_draft_lesson(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();

        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'Modul test',
                'order' => 1,
                'status' => 'published',
            ]);
        });

        $lesson = Lesson::withoutEvents(function () use ($course, $module) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => $module->id,
                'title' => 'Lecție draft',
                'content' => '<p>Conținut</p>',
                'type' => 'text',
                'status' => 'draft',
                'order' => 1,
            ]);
        });

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/lessons/{$lesson->id}")
            ->assertNotFound();
    }

    public function test_guest_cannot_view_draft_course(): void
    {
        $course = Course::factory()->create(['status' => 'draft']);

        $this->getJson("/api/courses/{$course->id}")
            ->assertNotFound();
    }

    public function test_course_complete_requires_authentication(): void
    {
        $course = Course::factory()->published()->create();

        $this->postJson("/api/courses/{$course->id}/complete")
            ->assertUnauthorized();
    }

    public function test_admin_course_show_omits_draft_linked_tests_by_default(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->published()->create();

        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'Modul',
                'order' => 1,
                'status' => 'published',
            ]);
        });

        $draftTest = Test::factory()->create(['status' => 'draft', 'title' => 'Test ciornă']);
        $publishedTest = Test::factory()->published()->create(['title' => 'Test publicat']);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $draftTest->id,
            'scope' => 'course',
            'scope_id' => null,
            'order' => 1,
            'required' => false,
            'passing_score' => 70,
        ]);
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $publishedTest->id,
            'scope' => 'course',
            'scope_id' => null,
            'order' => 2,
            'required' => false,
            'passing_score' => 70,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/courses/{$course->id}")
            ->assertOk();

        $examIds = collect($response->json('exams') ?? [])->pluck('id')->all();
        $this->assertContains($publishedTest->id, $examIds);
        $this->assertNotContains($draftTest->id, $examIds);

        $withDrafts = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/courses/{$course->id}?include_draft_tests=1")
            ->assertOk();

        $examIdsWithDrafts = collect($withDrafts->json('exams') ?? [])->pluck('id')->all();
        $this->assertContains($draftTest->id, $examIdsWithDrafts);
    }
}
