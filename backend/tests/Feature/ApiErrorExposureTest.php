<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiErrorExposureTest extends TestCase
{
    use RefreshDatabase;

    public function test_exposing_errors_keeps_not_found_and_unauthenticated_statuses(): void
    {
        config(['app.expose_api_errors' => true]);

        $this->getJson('/api/auth/me')->assertUnauthorized();

        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $this->actingAs($student, 'sanctum')->getJson('/api/courses/999999/progress')->assertNotFound();
        $this->actingAs($student, 'sanctum')->getJson('/api/admin/users')->assertForbidden();
    }
}
