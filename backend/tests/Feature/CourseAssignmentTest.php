<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Lesson;
use App\Models\Team;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_attaching_a_team_enrolls_student_members_only(): void
    {
        [$admin, $course, $team, $student, $other] = $this->setupCourseTeamAndStudents();
        $team->users()->sync([$student->id, $other->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/teams", ['team_ids' => [$team->id]])
            ->assertOk();

        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'assignment_source' => 'team',
        ]);
        $this->assertDatabaseMissing('course_user', [
            'user_id' => $other->id,
            'course_id' => $course->id,
        ]);
    }

    public function test_unchecking_a_team_unenrolls_team_members_but_keeps_direct_assigns(): void
    {
        [$admin, $course, $team, $student] = $this->setupCourseTeamAndStudents();
        $direct = User::factory()->create(['role' => 'student']);
        $team->users()->sync([$student->id, $direct->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/teams", ['team_ids' => [$team->id]])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/learners", [
                'user_ids' => [$direct->id],
                'is_mandatory' => false,
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/teams", ['team_ids' => []])
            ->assertOk();

        $this->assertDatabaseMissing('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
        ]);
        $this->assertDatabaseHas('course_user', [
            'user_id' => $direct->id,
            'course_id' => $course->id,
            'assignment_source' => 'direct',
        ]);
    }

    public function test_direct_assign_does_not_remove_other_courses(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $keep = Course::factory()->published()->create();
        $add = Course::factory()->published()->create();

        $student->assignedCourses()->attach($keep->id, [
            'is_mandatory' => false,
            'assigned_at' => now(),
            'enrolled' => true,
            'enrolled_at' => now(),
            'assignment_source' => 'direct',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$add->id}/learners", [
                'user_ids' => [$student->id],
                'is_mandatory' => false,
            ])
            ->assertOk();

        $this->assertEqualsCanonicalizing(
            [$keep->id, $add->id],
            $student->assignedCourses()->pluck('courses.id')->all()
        );
    }
    public function test_attaching_courses_to_team_enrolls_members_and_removing_unenrolls_team_source(): void
    {
        [$admin, $course, $team, $student] = $this->setupCourseTeamAndStudents();
        $team->users()->sync([$student->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/teams/{$team->id}/courses", ['course_ids' => [$course->id]])
            ->assertOk();

        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'assignment_source' => 'team',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/teams/{$team->id}/courses", ['course_ids' => []])
            ->assertOk();

        $this->assertDatabaseMissing('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
        ]);
    }

    public function test_adding_a_student_to_a_team_enrolls_existing_team_courses(): void
    {
        [$admin, $course, $team, $student] = $this->setupCourseTeamAndStudents();
        $team->courses()->sync([$course->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/teams/{$team->id}/users", ['user_ids' => [$student->id]])
            ->assertOk();

        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'assignment_source' => 'team',
        ]);
    }
    public function test_detaching_a_direct_assign_demotes_to_team_when_user_still_in_linked_team(): void
    {
        [$admin, $course, $team, $student] = $this->setupCourseTeamAndStudents();
        $team->users()->sync([$student->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/teams", ['team_ids' => [$team->id]])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/learners", [
                'user_ids' => [$student->id],
                'is_mandatory' => false,
            ])
            ->assertOk();

        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'assignment_source' => 'direct',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/courses/{$course->id}/learners/{$student->id}")
            ->assertOk();

        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'assignment_source' => 'team',
        ]);
    }

    public function test_creating_a_student_in_a_team_enrolls_team_courses(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->published()->create();
        $team = Team::create([
            'name' => 'Echipa Alpha',
            'owner_id' => $admin->id,
        ]);
        $team->courses()->sync([$course->id]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/users', [
                'name' => 'Elev Nou',
                'email' => 'elev.nou@example.test',
                'role' => 'student',
                'team_id' => $team->id,
            ])
            ->assertCreated();

        $userId = $response->json('user.id');
        $this->assertDatabaseHas('course_user', [
            'user_id' => $userId,
            'course_id' => $course->id,
            'assignment_source' => 'team',
        ]);
    }

    public function test_course_overview_counts_live_enrollments_and_root_lessons(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->published()->create();
        $student = User::factory()->create(['role' => 'student']);
        $course->assignedUsers()->attach($student->id, ['enrolled' => true, 'assignment_source' => 'direct']);

        Lesson::withoutEvents(function () use ($course) {
            Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție fără modul',
                'content' => '<p>Text</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });
        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/courses/{$course->id}")
            ->assertOk();

        $response->assertJsonPath('enrollments_count', 1);
        $response->assertJsonPath('total_enrollments', 1);
        $response->assertJsonPath('modules_count', 0);
        $response->assertJsonPath('lessons_count', 1);
        $response->assertJsonPath('exams_count', 1);
    }

    /**
     * @return array{0: User, 1: Course, 2: Team, 3: User, 4?: User}
     */
    private function setupCourseTeamAndStudents(): array
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->published()->create();
        $team = Team::create([
            'name' => 'Echipa Test',
            'owner_id' => $admin->id,
        ]);
        $student = User::factory()->create(['role' => 'student']);
        $instructor = User::factory()->create(['role' => 'instructor']);

        return [$admin, $course, $team, $student, $instructor];
    }
}
