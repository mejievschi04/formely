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

    public function test_student_cannot_view_activity_log(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            $this->markTestSkipped('activity_logs table missing');
        }

        $student = User::factory()->create(['role' => 'student']);

        ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'enrolled_course',
            'model_type' => 'Course',
            'model_id' => 1,
            'description' => 'Student enrolled',
            'new_values' => ['course_id' => 1, 'course_title' => 'Test Course'],
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson('/api/student/activity')
            ->assertForbidden();
    }

    public function test_student_cannot_view_auth_activity_scope(): void
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

        $this->actingAs($student, 'sanctum')
            ->getJson('/api/student/activity?scope=auth')
            ->assertForbidden();
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/student/activity')->assertUnauthorized();
    }
}
