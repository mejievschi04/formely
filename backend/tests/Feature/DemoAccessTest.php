<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class DemoAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['formely.demo_instance' => true]);
    }

    public function test_main_instance_refuses_demo_login_even_when_flag_is_enabled(): void
    {
        config(['formely.demo_instance' => false, 'formely.demo_login_enabled' => true]);
        $this->postJson('/api/auth/demo-login')->assertNotFound();
        $this->assertGuest();
    }

    public function test_main_academy_never_gets_demo_ui_or_readonly_restrictions_from_a_legacy_slug(): void
    {
        config(['formely.demo_instance' => false]);
        $company = Company::create([
            'name' => 'Academie reală', 'slug' => config('formely.demo_company_slug'),
            'status' => 'active', 'plan' => 'business',
        ]);
        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'admin']);

        $this->withSession(['public_demo_user_id' => $user->id])->actingAs($user, 'sanctum');
        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.is_demo', false)
            ->assertJsonPath('user.company.is_demo', false)
            ->assertJsonPath('user.is_public_demo_session', false);
        $this->putJson('/api/profile', ['name' => 'Administrator academie', 'email' => $user->email])->assertOk();
        $this->assertSame('Administrator academie', $user->fresh()->name);
    }

    public function test_other_academies_are_not_demo_even_on_a_demo_instance(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $this->actingAs($user, 'sanctum')->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.is_demo', false)
            ->assertJsonPath('user.company.is_demo', false);
    }

    public function test_production_seed_refuses_main_instance_without_creating_demo_data(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['formely.demo_instance' => false]);
        $this->artisan('demo:seed-company')->assertFailed();
        $this->assertDatabaseMissing('companies', ['slug' => 'formely-demo']);
    }

    public function test_guide_session_is_only_enabled_by_public_demo_login(): void
    {
        $company = Company::create([
            'name' => 'Demo', 'slug' => 'public-demo',
            'status' => 'active', 'plan' => 'business',
        ]);
        $user = User::factory()->create([
            'company_id' => $company->id, 'role' => 'admin', 'status' => 'active',
            'password' => bcrypt('Password123!'),
        ]);
        config([
            'formely.demo_login_enabled' => true,
            'formely.demo_login_email' => $user->email,
            'formely.demo_company_slug' => $company->slug,
        ]);

        $this->postJson('/api/auth/demo-login')->assertOk()
            ->assertJsonPath('user.is_public_demo_session', true);
        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.is_public_demo_session', true);
        Auth::shouldUse('web');
        $this->postJson('/api/auth/login', [
            'email' => $user->email, 'password' => 'Password123!',
        ])->assertOk()->assertJsonPath('user.is_public_demo_session', false);
        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.is_public_demo_session', false);
    }

    public function test_normal_account_does_not_inherit_public_demo_session(): void
    {
        $user = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $this->withSession(['public_demo_user_id' => $user->id])
            ->actingAs($user, 'sanctum')->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.is_public_demo_session', false);
    }

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

    public function test_demo_login_refuses_default_academy_even_when_misconfigured_as_demo(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        config([
            'formely.demo_login_enabled' => true,
            'formely.demo_login_email' => $user->email,
            'formely.demo_company_slug' => config('formely.default_company_slug'),
        ]);
        $this->postJson('/api/auth/demo-login')->assertStatus(503);
        $this->assertGuest();
    }

    public function test_demo_seed_creates_separate_named_academy_and_clears_context(): void
    {
        $this->artisan('demo:seed-company')->assertSuccessful();
        $this->assertDatabaseHas('companies', ['slug' => 'formely-demo', 'name' => 'Academie Demo']);
        $demo = Company::where('slug', 'formely-demo')->firstOrFail();
        $this->assertNotSame(config('formely.default_company_slug'), $demo->slug);
        $this->assertSame(24, User::withoutGlobalScopes()->where('company_id', $demo->id)->count());
        $this->assertNull(\App\Support\TenantContext::companyId());
    }

    public function test_demo_seed_refuses_real_academy_slug_without_changes(): void
    {
        $company = Company::create(['name' => 'Real Academy', 'slug' => 'real', 'plan' => 'business', 'status' => 'active']);
        $this->artisan('demo:seed-company', ['--slug' => 'real'])->assertFailed();
        $this->assertSame('Real Academy', $company->fresh()->name);
    }

    public function test_demo_seed_never_moves_existing_accounts_from_real_academy(): void
    {
        $user = User::factory()->create(['email' => 'owner@demo.formely.local']);
        $companyId = $user->company_id;
        $this->artisan('demo:seed-company')->assertFailed();
        $this->assertSame($companyId, $user->fresh()->company_id);
        $this->assertDatabaseMissing('companies', ['slug' => 'formely-demo']);
    }

    public function test_demo_and_real_academy_cannot_read_each_others_courses(): void
    {
        $demo = Company::create(['name' => 'Academie Demo', 'slug' => 'formely-demo', 'plan' => 'business', 'status' => 'active']);
        $demoAdmin = User::factory()->create(['company_id' => $demo->id, 'role' => 'admin']);
        $realAdmin = User::factory()->create(['role' => 'admin']);
        $demoCourse = Course::factory()->create(['company_id' => $demo->id]);
        $realCourse = Course::factory()->create(['company_id' => $realAdmin->company_id]);
        $this->actingAs($demoAdmin, 'sanctum')->getJson('/api/admin/courses/'.$realCourse->id)->assertNotFound();
        $this->actingAs($realAdmin, 'sanctum')->getJson('/api/admin/courses/'.$demoCourse->id)->assertNotFound();
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
