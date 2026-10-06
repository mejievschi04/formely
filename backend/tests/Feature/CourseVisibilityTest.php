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
        $course->assignedUsers()->attach($student->id, ['enrolled' => true]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('id', $course->id);
    }

    public function test_student_cannot_view_published_course_not_assigned_to_them(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}")
            ->assertForbidden();
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

    public function test_admin_preview_lists_and_opens_draft_lesson_test(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->create(['status' => 'draft']);
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'title' => 'Lecție', 'content' => 'x',
            'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        $draftTest = Test::factory()->create(['status' => 'draft', 'title' => 'Test ciornă']);
        \App\Models\Question::factory()->create(['test_id' => $draftTest->id]);
        CourseTest::create([
            'course_id' => $course->id, 'test_id' => $draftTest->id,
            'scope' => 'lesson', 'scope_id' => $lesson->id, 'order' => 0,
        ]);

        $lessons = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/courses/{$course->id}?include_draft_tests=1")
            ->assertOk()
            ->json('lessons');
        $this->assertSame($draftTest->id, $lessons[0]['course_tests'][0]['test_id']);
        $this->assertSame('draft', $lessons[0]['course_tests'][0]['test']['status']);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/exams/{$draftTest->id}?course_id={$course->id}")
            ->assertOk()
            ->assertJsonCount(1, 'questions');
    }
}
