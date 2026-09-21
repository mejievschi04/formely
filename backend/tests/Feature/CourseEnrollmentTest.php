<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use App\Services\EnrollmentAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CourseEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_accessing_course_progress_does_not_enroll_the_student(): void
    {
        $student = User::factory()->create([
            'role' => 'student',
        ]);

        $course = Course::factory()->published()->create([
            'access_type' => 'free',
            'enrollment_type' => 'open',
        ]);

        $response = $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}/progress");

        $response->assertOk();
        $response->assertJsonPath('enrolled', false);
        $this->assertDatabaseMissing('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
        ]);
    }

    public function test_student_cannot_self_enroll_by_opening_a_course(): void
    {
        $student = User::factory()->create([
            'role' => 'student',
        ]);

        $course = Course::factory()->published()->create([
            'access_type' => 'free',
            'enrollment_type' => 'open',
        ]);

        $response = $this->actingAs($student, 'sanctum')
            ->postJson("/api/courses/{$course->id}/enroll");

        $response->assertStatus(403);
        $response->assertJsonPath('enrolled', false);
        $this->assertDatabaseMissing('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
        ]);
    }

    public function test_student_is_enrolled_when_the_course_is_assigned(): void
    {
        $student = User::factory()->create([
            'role' => 'student',
        ]);

        $course = Course::factory()->published()->create([
            'access_type' => 'free',
            'enrollment_type' => 'open',
        ]);

        $admin = User::factory()->create(['role' => 'admin']);
        $service = app(EnrollmentAssignmentService::class);
        $service->assignCourseToUsers($course, [$student->id], [
            'assigned_by' => $admin,
            'is_mandatory' => false,
        ]);

        $this->assertTrue(
            DB::table('course_user')
                ->where('user_id', $student->id)
                ->where('course_id', $course->id)
                ->where('enrolled', true)
                ->exists()
        );

        $response = $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$course->id}/progress");

        $response->assertOk();
        $response->assertJsonPath('enrolled', true);
    }
}
