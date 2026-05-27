<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuthActivityLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_successful_login_writes_activity_log_and_updates_last_login(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            $this->markTestSkipped('activity_logs table missing');
        }

        $user = User::factory()->create([
            'email' => 'login.log@test.local',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'last_login_at' => null,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'login.log@test.local',
            'password' => 'Password123',
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'action' => 'logged_in',
        ]);

        $this->assertNotNull($user->fresh()->last_login_at);
    }

    public function test_logout_writes_activity_log(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            $this->markTestSkipped('activity_logs table missing');
        }

        $user = User::factory()->create([
            'email' => 'logout.log@test.local',
            'role' => 'student',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/auth/logout');

        $response->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'action' => 'logged_out',
        ]);
    }
}
