<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompanySuspendMidSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
    }

    public function test_auth_me_rejects_when_company_is_suspended_mid_session(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('academie');
        $company = Company::create([
            'name' => 'Trial Co',
            'slug' => 'trial-co',
            'status' => Company::STATUS_TRIAL,
            'plan' => 'academie',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
            'trial_ends_at' => now()->addDays(5),
        ]);

        $user = User::factory()->create([
            'email' => 'owner@trial.example',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        Sanctum::actingAs($user);
        TenantContext::setFromUser($user);

        $this->getJson('/api/auth/me')->assertOk();

        $company->update(['status' => Company::STATUS_SUSPENDED]);

        $this->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertJsonPath('company_suspended', true);
    }

    public function test_expire_trials_command_suspends_expired_companies(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $expired = Company::create([
            'name' => 'Expired Trial',
            'slug' => 'expired-trial',
            'status' => Company::STATUS_TRIAL,
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
            'trial_ends_at' => now()->subDay(),
        ]);
        $active = Company::create([
            'name' => 'Active Trial',
            'slug' => 'active-trial',
            'status' => Company::STATUS_TRIAL,
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
            'trial_ends_at' => now()->addDays(3),
        ]);

        Artisan::call('companies:expire-trials');

        $this->assertSame(Company::STATUS_SUSPENDED, $expired->fresh()->status);
        $this->assertSame(Company::STATUS_TRIAL, $active->fresh()->status);
    }
}
