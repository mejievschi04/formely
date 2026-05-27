<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CourseEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_self_enroll_in_open_free_course(): void
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

        $response->assertOk();
        $response->assertJsonPath('enrolled', true);
        $this->assertDatabaseHas('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
        ]);
    }

    public function test_student_cannot_self_enroll_in_invite_only_course(): void
    {
        $student = User::factory()->create([
            'role' => 'student',
        ]);

        $course = Course::factory()->published()->create([
            'access_type' => 'free',
            'enrollment_type' => 'by_invite',
        ]);

        $response = $this->actingAs($student, 'sanctum')
            ->postJson("/api/courses/{$course->id}/enroll");

        $response->assertStatus(403);
        $this->assertDatabaseMissing('course_user', [
            'user_id' => $student->id,
            'course_id' => $course->id,
        ]);
    }
}
