<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoursePublishTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_builder_validate_requires_auth(): void
    {
        $course = Course::factory()->create(['status' => 'draft']);

        $this->postJson("/api/admin/courses/{$course->id}/builder/validate")
            ->assertUnauthorized();
    }

    public function test_admin_can_validate_draft_course(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->create(['status' => 'draft']);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/builder/validate")
            ->assertOk()
            ->assertJsonStructure(['ok', 'errors', 'warnings']);
    }
}
