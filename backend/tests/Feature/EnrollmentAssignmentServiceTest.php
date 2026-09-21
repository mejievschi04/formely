<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\EnrollmentAssignment;
use App\Models\Team;
use App\Models\Test;
use App\Models\User;
use App\Services\EnrollmentAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EnrollmentAssignmentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_assign_course_to_users_enrolls_and_records_assignment(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $test = Test::factory()->published()->create(['created_by' => $teacher->id]);

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $admin = User::factory()->create(['role' => 'admin']);
        $service = app(EnrollmentAssignmentService::class);

        $result = $service->assignCourseToUsers($course, [$student->id], [
            'assigned_by' => $admin,
            'is_mandatory' => true,
        ]);

        $this->assertArrayHasKey($student->id, $result['assigned']);
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
            'assigned_by' => $admin->id,
            'source_type' => EnrollmentAssignment::SOURCE_MANUAL,
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
        ]);
    }

    public function test_assign_course_to_team_assigns_all_student_members(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $test = Test::factory()->published()->create(['created_by' => $teacher->id]);
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'scope_id' => $course->id,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $studentOne = User::factory()->create(['role' => 'student']);
        $studentTwo = User::factory()->create(['role' => 'student']);
        $team = Team::create([
            'name' => 'Sales Team',
            'owner_id' => $teacher->id,
        ]);
        $team->users()->attach([$studentOne->id, $studentTwo->id]);

        $service = app(EnrollmentAssignmentService::class);
        $result = $service->assignCourseToTeam($course, $team, [
            'assigned_by' => User::factory()->create(['role' => 'admin']),
            'is_mandatory' => false,
        ]);

        $this->assertCount(2, $result['assigned']);
        $this->assertSame(2, EnrollmentAssignment::query()
            ->where('source_type', EnrollmentAssignment::SOURCE_TEAM)
            ->where('source_team_id', $team->id)
            ->count());
    }

    public function test_mandatory_course_without_required_flag_can_be_assigned(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);

        $result = app(EnrollmentAssignmentService::class)->assignCourseToUsers($course, [$student->id], [
            'is_mandatory' => true,
        ]);

        $this->assertArrayHasKey($student->id, $result['assigned']);
        $this->assertTrue(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->exists()
        );
    }

    public function test_sync_manual_courses_keeps_team_enrollments(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $teamCourse = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $directCourse = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $student = User::factory()->create(['role' => 'student']);
        $team = Team::create(['name' => 'Alpha', 'owner_id' => $teacher->id]);
        $team->users()->attach([$student->id]);
        $team->courses()->attach([$teamCourse->id]);

        $service = app(EnrollmentAssignmentService::class);
        $service->assignCourseToTeam($teamCourse, $team, ['is_mandatory' => false]);
        $service->syncManualCourseAssignments($student, [$directCourse->id], ['is_mandatory' => false]);

        $this->assertTrue(
            DB::table('course_user')->where('user_id', $student->id)->where('course_id', $teamCourse->id)->where('enrolled', true)->exists()
        );
        $this->assertTrue(
            DB::table('course_user')->where('user_id', $student->id)->where('course_id', $directCourse->id)->where('enrolled', true)->exists()
        );
        $this->assertDatabaseHas('enrollment_assignments', [
            'user_id' => $student->id,
            'course_id' => $teamCourse->id,
            'source_type' => EnrollmentAssignment::SOURCE_TEAM,
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
        ]);
    }

    public function test_revoke_manual_keeps_enrollment_when_user_still_in_linked_team(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $course = Course::factory()->published()->create(['teacher_id' => $teacher->id]);
        $student = User::factory()->create(['role' => 'student']);
        $team = Team::create(['name' => 'Beta', 'owner_id' => $teacher->id]);
        $team->users()->attach([$student->id]);
        $team->courses()->attach([$course->id]);

        $service = app(EnrollmentAssignmentService::class);
        $service->assignCourseToTeam($course, $team, ['is_mandatory' => false]);
        $service->assignCourseToUsers($course, [$student->id], ['is_mandatory' => false]);
        $service->revokeManualCourseAssignment($student, $course);

        $this->assertTrue(
            DB::table('course_user')->where('user_id', $student->id)->where('course_id', $course->id)->where('enrolled', true)->exists()
        );
        $this->assertDatabaseHas('enrollment_assignments', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'source_type' => EnrollmentAssignment::SOURCE_TEAM,
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
        ]);
        $this->assertDatabaseMissing('enrollment_assignments', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'source_type' => EnrollmentAssignment::SOURCE_MANUAL,
            'status' => EnrollmentAssignment::STATUS_ACTIVE,
        ]);
    }
}
