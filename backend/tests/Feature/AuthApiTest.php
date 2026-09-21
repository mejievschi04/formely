<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Mockery;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_register_creates_pending_student_and_returns_pending_response(): void
    {
        config(['formely.public_register_enabled' => true]);

        $this->mock(NotificationService::class, function ($mock) {
            $mock->shouldReceive('notifyRegistrationRequested')->once();
        });

        $payload = [
            'name' => 'Ana Popescu',
            'email' => 'ana.popescu@example.com',
            'password' => 'Password123',
        ];

        $response = $this->postJson('/api/auth/register', $payload);

        $response->assertCreated()
            ->assertJson([
                'pending_approval' => true,
            ]);

        $this->assertDatabaseHas('users', [
            'email' => 'ana.popescu@example.com',
            'name' => 'Ana Popescu',
            'role' => 'student',
            'status' => 'pending',
        ]);

        $user = User::where('email', 'ana.popescu@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('Password123', $user->password));
    }

    public function test_register_is_disabled_by_default(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Ana Popescu',
            'email' => 'ana.popescu@example.com',
            'password' => 'Password123',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'ana.popescu@example.com']);
    }

    public function test_login_rejects_pending_accounts(): void
    {
        User::factory()->create([
            'name' => 'Pending User',
            'email' => 'pending@example.com',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'status' => 'pending',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'pending@example.com',
            'password' => 'Password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_rejects_suspended_accounts(): void
    {
        User::factory()->create([
            'name' => 'Suspended User',
            'email' => 'suspended@example.com',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'status' => 'suspended',
            'suspended_reason' => 'Încălcarea regulilor',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'suspended@example.com',
            'password' => 'Password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_allows_account_after_temporary_suspension_expires(): void
    {
        User::factory()->create([
            'name' => 'Temp Suspended',
            'email' => 'temp@example.com',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'status' => 'suspended',
            'suspended_until' => now()->subMinute(),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'temp@example.com',
            'password' => 'Password123',
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('users', [
            'email' => 'temp@example.com',
            'status' => 'active',
        ]);
    }

    public function test_login_rejects_inactive_accounts(): void
    {
        User::factory()->create([
            'name' => 'Inactive User',
            'email' => 'inactive@example.com',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'status' => 'inactive',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'inactive@example.com',
            'password' => 'Password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_me_rejects_suspended_accounts(): void
    {
        $user = User::factory()->create([
            'name' => 'Suspended Me',
            'email' => 'suspended-me@example.com',
            'role' => 'student',
            'status' => 'suspended',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/auth/me');

        $response->assertStatus(403)
            ->assertJsonPath('access_blocked', true)
            ->assertJsonPath('suspended', true);
    }

    public function test_me_returns_current_user_profile(): void
    {
        $user = User::factory()->create([
            'name' => 'Maria Ionescu',
            'email' => 'maria.ionescu@example.com',
            'role' => 'student',
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/auth/me');

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.name', 'Maria Ionescu')
            ->assertJsonPath('user.email', 'maria.ionescu@example.com')
            ->assertJsonPath('user.role', 'student');
    }

    public function test_change_password_updates_the_password_and_clears_must_change_flag(): void
    {
        $user = User::factory()->create([
            'name' => 'Ion Pop',
            'email' => 'ion.pop@example.com',
            'password' => Hash::make('Password123'),
            'role' => 'student',
            'must_change_password' => true,
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/auth/change-password', [
            'current_password' => 'Password123',
            'new_password' => 'NewPassword123',
            'new_password_confirmation' => 'NewPassword123',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.must_change_password', false);

        $freshUser = $user->fresh();
        $this->assertNotNull($freshUser);
        $this->assertTrue(Hash::check('NewPassword123', $freshUser->password));
        $this->assertFalse((bool) $freshUser->must_change_password);
    }

    public function test_logout_revokes_bearer_token(): void
    {
        $user = User::factory()->create([
            'name' => 'Logout User',
            'email' => 'logout@example.com',
            'role' => 'student',
        ]);

        $tokenResult = $user->createToken('test-token');
        $plainToken = $tokenResult->plainTextToken;
        $tokenId = $tokenResult->accessToken->id;

        $response = $this->withHeader('Authorization', 'Bearer ' . $plainToken)
            ->postJson('/api/auth/logout');

        $response->assertOk()
            ->assertJson([
                'message' => 'Deconectare reușită',
            ]);

        $this->assertDatabaseMissing('personal_access_tokens', [
            'id' => $tokenId,
        ]);
    }
}
