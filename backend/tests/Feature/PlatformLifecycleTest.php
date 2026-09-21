<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlatformLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
        Mail::fake();
    }

    public function test_sales_path_from_lead_to_gated_academy(): void
    {
        $this->postJson('/api/leads', [
            'name' => 'Ana Demo',
            'email' => 'ana@client.example',
            'company_name' => 'Client SRL',
            'reason' => 'demo',
            'plan_interest' => 'academie',
            'message' => 'Vrem academie.',
            'privacy_accepted' => true,
        ])->assertCreated();

        $ops = User::factory()->create([
            'name' => 'Platform Ops',
            'email' => 'platform@formely.local',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);

        Sanctum::actingAs($ops);

        $this->getJson('/api/admin/courses')->assertForbidden();
        $this->getJson('/api/platform/overview')->assertOk();

        $created = $this->postJson('/api/platform/companies', [
            'name' => 'Academia Client',
            'slug' => 'academia-client',
            'plan' => 'academie',
            'status' => 'trial',
            'owner_email' => 'owner@client.example',
            'owner_name' => 'Owner Demo',
        ]);

        $created->assertCreated();
        $inviteUrl = $created->json('invite_url');
        $this->assertNotEmpty($inviteUrl);

        $trialDays = (int) config('formely.trial_days', 15);
        $company = Company::query()->where('slug', 'academia-client')->firstOrFail();
        $this->assertSame('trial', $company->status);
        $this->assertNotNull($company->trial_ends_at);
        $this->assertEqualsWithDelta(
            now()->addDays($trialDays)->timestamp,
            $company->trial_ends_at->timestamp,
            180
        );

        parse_str((string) parse_url($inviteUrl, PHP_URL_QUERY), $query);
        $token = $query['token'] ?? '';
        $this->assertNotEmpty($token);

        $this->app['auth']->forgetGuards();
        TenantContext::clear();

        $this->getJson('/api/auth/invitations/validate?token=' . urlencode($token))
            ->assertOk()
            ->assertJsonPath('email', 'owner@client.example');

        $this->postJson('/api/auth/invitations/accept', [
            'token' => $token,
            'name' => 'Owner Demo',
            'password' => 'Password1',
            'password_confirmation' => 'Password1',
        ])->assertCreated();

        $this->postJson('/api/auth/login', [
            'email' => 'owner@client.example',
            'password' => 'Password1',
        ])->assertOk()
            ->assertJsonPath('user.is_platform_admin', false)
            ->assertJsonPath('user.role', UserRoles::COMPANY_OWNER);

        $owner = User::withoutGlobalScopes()->where('email', 'owner@client.example')->firstOrFail();
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($owner);

        $this->getJson('/api/platform/overview')->assertForbidden();
        $this->getJson('/api/library/items')->assertOk();

        $instructorDefaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $instructorCo = Company::create([
            'name' => 'Solo Instructor',
            'slug' => 'solo-instructor',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $instructorDefaults['max_active_learners'],
            'max_staff' => $instructorDefaults['max_staff'],
            'features' => $instructorDefaults['features'],
        ]);
        $instructor = User::factory()->create([
            'email' => 'teach@example.com',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::INSTRUCTOR,
            'company_id' => $instructorCo->id,
            'status' => 'active',
        ]);
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($instructor);
        $this->getJson('/api/library/items')->assertForbidden();

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($ops);
        $this->getJson('/api/admin/courses')->assertForbidden();
        $this->getJson('/api/library/items')->assertForbidden();
    }

    public function test_platform_admin_login_payload_marks_control_plane(): void
    {
        User::factory()->create([
            'name' => 'Ops',
            'email' => 'ops@formely.local',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'ops@formely.local',
            'password' => 'Password1',
        ], [
            'X-Formely-Client' => 'backoffice',
        ])->assertOk()
            ->assertJsonPath('user.is_platform_admin', true);

        $this->postJson('/api/auth/login', [
            'email' => 'ops@formely.local',
            'password' => 'Password1',
        ])->assertStatus(422);
    }
}
