<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_demo_login_is_disabled_by_default(): void
    {
        config(['formely.demo_login_enabled' => false]);
        $this->postJson('/api/auth/demo-login')->assertNotFound();
        $this->assertGuest();
    }

    public function test_demo_login_cannot_authenticate_an_account_from_another_academy(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        config([
            'formely.demo_login_enabled' => true,
            'formely.demo_login_email' => $user->email,
            'formely.demo_company_slug' => 'only-demo-academy',
        ]);
        $this->postJson('/api/auth/demo-login')->assertStatus(503);
        $this->assertGuest();
    }

    public function test_demo_admin_cannot_change_profile_or_password_but_can_read_profile(): void
    {
        $company = Company::create([
            'name' => 'Demo', 'slug' => 'only-demo-academy',
            'status' => 'active', 'plan' => 'business',
        ]);
        config(['formely.demo_company_slug' => $company->slug]);
        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'admin']);
        $this->actingAs($user, 'sanctum');
        $this->getJson('/api/profile')->assertOk();
        $this->putJson('/api/profile', ['name' => 'Changed'])->assertForbidden()->assertJsonPath('demo_readonly', true);
        $this->postJson('/api/auth/change-password', [])->assertForbidden()->assertJsonPath('demo_readonly', true);
        $this->assertSame($user->name, $user->fresh()->name);
    }
}
