<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SaasPlanEntitlementsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
        Mail::fake();
    }

    public function test_instructor_plan_blocks_library_and_ai_stats(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'Demo Instructor',
            'slug' => 'demo-instructor',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);

        $service = app(PlanEntitlementService::class);
        $this->assertFalse($service->companyCan($company, 'ai_stats'));
        $this->assertFalse($service->companyCan($company, 'library'));
        $this->assertTrue($service->learnerSeatAvailable($company, 1));
    }

    public function test_instructor_plan_rejects_analyst_role(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'No Analyst',
            'slug' => 'no-analyst',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);

        $this->expectException(ValidationException::class);
        app(PlanEntitlementService::class)->assertSeatAvailable($company, UserRoles::ANALYST, 1);
    }

    public function test_business_plan_allows_ai_suite(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('business');
        $company = Company::create([
            'name' => 'Demo Business',
            'slug' => 'demo-business',
            'status' => 'active',
            'plan' => 'business',
            'max_active_learners' => null,
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);

        $service = app(PlanEntitlementService::class);
        $this->assertTrue($service->companyCan($company, 'ai_creator'));
        $this->assertTrue($service->companyCan($company, 'ai_tutor'));
        $this->assertTrue($service->companyCan($company, 'library'));
        $this->assertNull($service->maxActiveLearners($company));
    }

    public function test_stored_features_cannot_exceed_plan_catalog(): void
    {
        $company = Company::create([
            'name' => 'Instructor Overreach',
            'slug' => 'instructor-overreach',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => 999,
            'max_staff' => 80,
            'features' => [
                'library' => true,
                'ai_creator' => true,
            ],
        ]);

        $service = app(PlanEntitlementService::class);
        $this->assertFalse($service->companyCan($company, 'library'));
        $this->assertFalse($service->companyCan($company, 'ai_creator'));
        $this->assertSame(50, $service->maxActiveLearners($company));
        $this->assertSame(2, $service->maxStaff($company));
    }

    public function test_business_custom_learner_cap_is_respected(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('business');
        $company = Company::create([
            'name' => 'Capped Biz',
            'slug' => 'capped-biz',
            'status' => 'active',
            'plan' => 'business',
            'max_active_learners' => 20,
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);

        $service = app(PlanEntitlementService::class);
        $this->assertSame(20, $service->maxActiveLearners($company));
        $this->assertTrue($service->companyCan($company, 'events'));
    }

    public function test_expired_trial_blocks_login_and_features(): void
    {
        $company = Company::create([
            'name' => 'Expired Trial',
            'slug' => 'expired-trial',
            'status' => 'trial',
            'plan' => 'academie',
            'trial_ends_at' => now()->subDay(),
        ]);
        $user = User::factory()->create([
            'email' => 'trial@example.com',
            'password' => bcrypt('Password1'),
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $this->assertFalse($company->isUsable());
        $this->assertFalse(app(PlanEntitlementService::class)->companyCan($company, 'library'));

        $this->postJson('/api/auth/login', [
            'email' => 'trial@example.com',
            'password' => 'Password1',
        ])->assertStatus(422);
    }

    public function test_instructor_hits_learner_seat_limit(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'Seat Cap',
            'slug' => 'seat-cap',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => 1,
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $owner = User::factory()->create([
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);
        User::factory()->create([
            'role' => UserRoles::STUDENT,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $this->actingAs($owner)->postJson('/api/admin/users', [
            'name' => 'Al Doilea',
            'email' => 'second@example.com',
            'role' => UserRoles::STUDENT,
            'password' => 'Password1',
        ])->assertStatus(422);

        $this->actingAs($owner)->getJson('/api/library/items')->assertForbidden();
        $this->actingAs($owner)->getJson('/api/admin/events')->assertForbidden();
    }

    public function test_pending_invites_count_toward_seats(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'Invite Cap',
            'slug' => 'invite-cap',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => 1,
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $owner = User::factory()->create([
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $this->actingAs($owner)->postJson('/api/admin/users/invitations', [
            'email' => 'one@example.com',
            'role' => UserRoles::STUDENT,
        ])->assertCreated();

        $this->actingAs($owner)->postJson('/api/admin/users/invitations', [
            'email' => 'two@example.com',
            'role' => UserRoles::STUDENT,
        ])->assertStatus(422);
    }

    public function test_platform_admin_can_create_company(): void
    {
        $admin = User::factory()->create([
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/platform/companies', [
            'name' => 'Academia Nord',
            'slug' => 'academia-nord',
            'plan' => 'academie',
            'status' => 'trial',
            'owner_email' => 'owner.nord@example.com',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('companies', [
            'slug' => 'academia-nord',
            'plan' => 'academie',
            'max_active_learners' => 250,
        ]);
    }

    public function test_platform_cannot_raise_instructor_seat_cap(): void
    {
        $admin = User::factory()->create([
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);
        $company = Company::create([
            'name' => 'Clamp Co',
            'slug' => 'clamp-co',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => 50,
            'max_staff' => 2,
        ]);

        $this->actingAs($admin)->putJson('/api/platform/companies/'.$company->id, [
            'plan' => 'instructor',
            'status' => 'active',
            'max_active_learners' => 500,
            'features' => ['library' => true],
        ])->assertOk();

        $company->refresh();
        $this->assertSame(50, $company->max_active_learners);
        $this->assertFalse(app(PlanEntitlementService::class)->companyCan($company, 'library'));
    }

    public function test_status_only_update_does_not_reset_custom_caps(): void
    {
        $admin = User::factory()->create([
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);
        $company = Company::create([
            'name' => 'Capped Status',
            'slug' => 'capped-status',
            'status' => 'trial',
            'plan' => 'business',
            'max_active_learners' => 20,
            'max_staff' => 8,
        ]);

        $this->actingAs($admin)->putJson('/api/platform/companies/'.$company->id, [
            'status' => 'active',
        ])->assertOk();

        $company->refresh();
        $this->assertSame('active', $company->status);
        $this->assertSame(20, $company->max_active_learners);
        $this->assertSame(8, $company->max_staff);
    }

    public function test_trashed_learner_does_not_occupy_a_seat(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'Trash Seats',
            'slug' => 'trash-seats',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => 1,
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $learner = User::factory()->create([
            'role' => UserRoles::STUDENT,
            'company_id' => $company->id,
            'status' => 'inactive',
        ]);
        $learner->delete();

        $this->assertTrue(app(PlanEntitlementService::class)->learnerSeatAvailable($company, 1));
    }

    public function test_lead_can_be_submitted_publicly(): void
    {
        $response = $this->postJson('/api/leads', [
            'name' => 'Ana Demo',
            'email' => 'ana@example.com',
            'company_name' => 'Example SRL',
            'reason' => 'demo',
            'plan_interest' => 'academie',
            'message' => 'Vrem un demo săptămâna viitoare.',
            'privacy_accepted' => true,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('leads', [
            'email' => 'ana@example.com',
            'plan_interest' => 'academie',
        ]);
    }

    public function test_suspended_company_blocks_login(): void
    {
        $company = Company::create([
            'name' => 'Suspended Co',
            'slug' => 'suspended-co',
            'status' => 'suspended',
            'plan' => 'instructor',
        ]);
        $user = User::factory()->create([
            'email' => 'blocked@example.com',
            'password' => bcrypt('Password1'),
            'role' => UserRoles::STUDENT,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'blocked@example.com',
            'password' => 'Password1',
        ]);

        $response->assertStatus(422);
    }

    public function test_instructor_plan_forbids_ai_question_generation_endpoint(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'No AI',
            'slug' => 'no-ai',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $owner = User::factory()->create([
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);
        TenantContext::setFromUser($owner);
        $bank = \App\Models\QuestionBank::create([
            'title' => 'Bank',
            'created_by' => $owner->id,
            'company_id' => $company->id,
            'status' => 'draft',
        ]);

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/admin/question-banks/{$bank->id}/ai/preview", [
                'content' => str_repeat('Material pentru evaluare. ', 10),
                'numberOfQuestions' => 1,
            ])
            ->assertForbidden();
    }

    public function test_academie_plan_allows_ai_generation_request_to_validate(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('academie');
        $company = Company::create([
            'name' => 'AI Academy',
            'slug' => 'ai-academy',
            'status' => 'active',
            'plan' => 'academie',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $owner = User::factory()->create([
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);
        TenantContext::setFromUser($owner);
        $bank = \App\Models\QuestionBank::create([
            'title' => 'Bank AI',
            'created_by' => $owner->id,
            'company_id' => $company->id,
            'status' => 'draft',
        ]);

        // Planul permite generarea: cererea trece de gate (fără cheie AI în teste nu ajunge la 200).
        $response = $this->actingAs($owner, 'sanctum')
            ->postJson("/api/admin/question-banks/{$bank->id}/ai/preview", []);
        $this->assertNotSame(403, $response->status());
    }

    public function test_invite_urls_use_lms_origin_not_cors_list(): void
    {
        config(['volta.frontend_url' => 'http://localhost:5173']);

        $this->assertSame(
            'http://localhost:5173/register/invite/abc',
            \App\Support\RegistrationInvitationUrl::build('abc')
        );
    }

    public function test_instructor_cannot_stream_ai_course_generation(): void
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');
        $company = Company::create([
            'name' => 'No Creator',
            'slug' => 'no-creator',
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
        $owner = User::factory()->create([
            'role' => UserRoles::ADMIN,
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $this->actingAs($owner, 'sanctum')
            ->postJson('/api/admin/ai/generate-course', [
                'prompt' => 'Curs scurt de onboarding',
                'mode' => 'guided_creation',
            ])
            ->assertForbidden();
    }
}
