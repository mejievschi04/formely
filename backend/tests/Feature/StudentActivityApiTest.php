<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class StudentActivityApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_sees_only_own_progress_activity(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            $this->markTestSkipped('activity_logs table missing');
        }

        $student = User::factory()->create(['role' => 'student']);
        $other = User::factory()->create(['role' => 'student']);

        ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'enrolled_course',
            'model_type' => 'Course',
            'model_id' => 1,
            'description' => 'Student enrolled',
            'new_values' => ['course_id' => 1, 'course_title' => 'Test Course'],
        ]);

        ActivityLog::create([
            'user_id' => $other->id,
            'action' => 'enrolled_course',
            'model_type' => 'Course',
            'model_id' => 2,
            'description' => 'Other enrolled',
            'new_values' => ['course_id' => 2, 'course_title' => 'Other'],
        ]);

        ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'telemetry.learner_focus_seconds',
            'description' => 'Noise',
            'new_values' => ['seconds' => 120],
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson('/api/student/activity');

        $response->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.action', 'enrolled_course')
            ->assertJsonPath('data.0.link', '/courses/1');
    }

    public function test_auth_scope_includes_login_events(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            $this->markTestSkipped('activity_logs table missing');
        }

        $student = User::factory()->create(['role' => 'student']);

        ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'logged_in',
            'model_type' => 'User',
            'model_id' => $student->id,
            'description' => 'Logged in',
        ]);

        $response = $this->actingAs($student, 'sanctum')
            ->getJson('/api/student/activity?scope=auth');

        $response->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.action', 'logged_in');
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/student/activity')->assertUnauthorized();
    }
}
