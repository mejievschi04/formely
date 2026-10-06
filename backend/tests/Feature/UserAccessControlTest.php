<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_suspends_and_reactivates_a_user(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/suspend", ['reason' => 'Părăsește firma'])
            ->assertOk()
            ->assertJsonPath('user.status', 'suspended')
            ->assertJsonPath('user.suspended_reason', 'Părăsește firma');

        // contul suspendat nu mai trece de API
        $this->app['auth']->forgetGuards();
        $this->actingAs($student->fresh(), 'sanctum')->getJson('/api/auth/me')->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/activate")
            ->assertOk()
            ->assertJsonPath('user.status', 'active');

        $this->app['auth']->forgetGuards();
        $this->actingAs($student->fresh(), 'sanctum')->getJson('/api/auth/me')->assertOk();
    }

    public function test_admin_can_require_a_password_change(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $student = User::factory()->create(['role' => 'student', 'status' => 'active', 'must_change_password' => false]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$student->id}/reset-access")
            ->assertOk();

        $this->assertTrue((bool) $student->fresh()->must_change_password);
    }

    public function test_admin_cannot_suspend_own_account(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$admin->id}/suspend")
            ->assertStatus(400);

        $this->assertSame('active', $admin->fresh()->status);
    }

    public function test_instructor_and_analyst_cannot_change_account_access(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);

        foreach (['instructor', 'analyst'] as $role) {
            $staff = User::factory()->create(['role' => $role, 'status' => 'active']);
            foreach (['suspend', 'activate', 'reset-access'] as $action) {
                $this->app['auth']->forgetGuards();
                $this->actingAs($staff, 'sanctum')
                    ->postJson("/api/admin/users/{$student->id}/{$action}")
                    ->assertForbidden();
            }
        }

        $this->assertSame('active', $student->fresh()->status);
    }
}
