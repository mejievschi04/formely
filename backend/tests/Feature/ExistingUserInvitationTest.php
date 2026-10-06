<?php

namespace Tests\Feature;

use App\Jobs\SendRegistrationInvitationEmailJob;
use App\Models\RegistrationInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ExistingUserInvitationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_account_is_activated_once_without_changing_identity(): void
    {
        Bus::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['status' => 'active', 'last_login_at' => null]);
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$user->id}/send-invitation")->assertOk();
        Bus::assertDispatched(SendRegistrationInvitationEmailJob::class);
        $invitation = RegistrationInvitation::where('user_id', $user->id)->firstOrFail();
        $token = Crypt::decryptString($invitation->encrypted_token);
        \Illuminate\Support\Facades\Auth::shouldUse('web');
        $this->postJson("/api/auth/invitations/{$token}/accept", [
            'name' => 'Alt Nume', 'password' => 'Password123', 'password_confirmation' => 'Password123',
        ])->assertCreated()->assertJsonPath('user.id', $user->id)->assertJsonPath('user.name', $user->name);
        $this->assertTrue(Hash::check('Password123', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->last_login_at);
        $this->assertSame(2, User::count());
        $this->postJson("/api/auth/invitations/{$token}/accept", [])->assertNotFound();
    }

    public function test_accessed_and_suspended_users_cannot_be_invited(): void
    {
        Bus::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        foreach ([['last_login_at' => now(), 'status' => 'active'], ['last_login_at' => null, 'status' => 'suspended']] as $attributes) {
            $user = User::factory()->create($attributes);
            $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$user->id}/send-invitation")->assertUnprocessable();
        }
        Bus::assertNothingDispatched();
    }

    public function test_invitation_is_unusable_after_normal_login(): void
    {
        Bus::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['status' => 'active', 'last_login_at' => null]);
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$user->id}/send-invitation")->assertOk();
        $invitation = RegistrationInvitation::where('user_id', $user->id)->firstOrFail();
        $token = Crypt::decryptString($invitation->encrypted_token);
        \Illuminate\Support\Facades\Auth::shouldUse('web');
        $user->forceFill(['last_login_at' => now()])->save();
        $this->postJson("/api/auth/invitations/{$token}/accept", [
            'name' => 'Test User', 'password' => 'Password123', 'password_confirmation' => 'Password123',
        ])->assertUnprocessable();
    }

    public function test_student_cannot_send_invitations(): void
    {
        Bus::fake();
        $student = User::factory()->create(['role' => 'student']);
        $this->actingAs($student, 'sanctum')->postJson("/api/admin/users/{$student->id}/send-invitation")->assertForbidden();
        Bus::assertNothingDispatched();
    }
}
