<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\EnrollmentAssignment;
use App\Models\Team;
use App\Models\User;
use App\Services\EnrollmentAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamAutoEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_team_member_is_auto_enrolled_in_team_courses(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);

        $team = Team::create(['name' => 'Sales', 'owner_id' => $admin->id]);
        $team->courses()->attach($course->id);

        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/teams/{$team->id}/users", [
            'user_ids' => [$student->id],
        ])->assertOk();

        $this->assertTrue(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->exists()
        );

        $this->assertDatabaseHas('enrollment_assignments', [
            'assignable_type' => EnrollmentAssignment::TYPE_COURSE,
            'course_id' => $course->id,
            'user_id' => $student->id,
            'source_type' => EnrollmentAssignment::SOURCE_TEAM,
            'source_team_id' => $team->id,
        ]);
    }

    public function test_new_team_course_auto_enrolls_existing_members(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);

        $team = Team::create(['name' => 'HR', 'owner_id' => $admin->id]);
        $team->users()->attach($student->id);

        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/teams/{$team->id}/courses", [
            'course_ids' => [$course->id],
        ])->assertOk();

        $this->assertTrue(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->exists()
        );
    }

    public function test_linking_team_to_course_auto_enrolls_team_members(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);

        $team = Team::create(['name' => 'Ops', 'owner_id' => $admin->id]);
        $team->users()->attach($student->id);

        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/courses/{$course->id}/teams", [
            'team_ids' => [$team->id],
        ])->assertOk();

        $this->assertTrue(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->exists()
        );
    }

    public function test_auto_enroll_skips_already_enrolled_user(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $team = Team::create(['name' => 'Reuse', 'owner_id' => $teacher->id]);
        $team->courses()->attach($course->id);

        DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'is_mandatory' => false,
            'enrolled' => true,
            'enrolled_at' => now(),
            'assigned_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $service = app(EnrollmentAssignmentService::class);
        $result = $service->autoEnrollUserForTeam($team, $student);

        $this->assertSame('already_enrolled', $result['skipped'][$student->id][$course->id] ?? null);
        $this->assertSame(0, EnrollmentAssignment::query()->count());
    }
}
