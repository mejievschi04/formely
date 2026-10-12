<?php

namespace Tests\Unit;

use App\Models\Company;
use App\Models\CompanyAiUsage;
use App\Services\AiQuotaService;
use App\Services\PlanEntitlementService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Tests\TestCase;

class AiQuotaServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
    }

    private function makeCompany(): Company
    {
        $defaults = app(PlanEntitlementService::class)->defaultsForPlan('instructor');

        return Company::create([
            'name' => 'Quota Co',
            'slug' => 'quota-co-'.uniqid(),
            'status' => 'active',
            'plan' => 'instructor',
            'max_active_learners' => $defaults['max_active_learners'],
            'max_staff' => $defaults['max_staff'],
            'features' => $defaults['features'],
        ]);
    }

    public function test_assert_can_does_not_consume(): void
    {
        $company = $this->makeCompany();
        $quota = app(AiQuotaService::class);
        $quota->assertCan($company, AiQuotaService::ACTION_COURSE);
        $this->assertSame(0, $quota->creditsUsed($company));
    }

    public function test_record_increments_credits_by_cost(): void
    {
        $company = $this->makeCompany();
        $quota = app(AiQuotaService::class);
        $courseCost = $quota->costFor(AiQuotaService::ACTION_COURSE);
        $quota->record($company, AiQuotaService::ACTION_COURSE);
        $quota->record($company, AiQuotaService::ACTION_COURSE);
        $this->assertSame($courseCost * 2, $quota->creditsUsed($company));
        $this->assertSame(1, CompanyAiUsage::query()->where('company_id', $company->id)->count());
        $this->assertSame(
            AiQuotaService::ACTION_CREDITS,
            CompanyAiUsage::query()->where('company_id', $company->id)->value('action')
        );
    }

    public function test_record_throws_when_credits_exhausted(): void
    {
        $company = $this->makeCompany();
        $quota = app(AiQuotaService::class);
        $limit = $quota->creditLimitFor($company);
        CompanyAiUsage::create([
            'company_id' => $company->id,
            'period' => $quota->currentPeriod(),
            'action' => AiQuotaService::ACTION_CREDITS,
            'used' => $limit,
        ]);

        $this->expectException(HttpResponseException::class);
        $quota->record($company, AiQuotaService::ACTION_TEST);
    }

    public function test_mixed_actions_share_credit_pool(): void
    {
        $company = $this->makeCompany();
        $quota = app(AiQuotaService::class);
        $quota->record($company, AiQuotaService::ACTION_COURSE); // 15
        $quota->record($company, AiQuotaService::ACTION_TEST); // 3
        $this->assertSame(18, $quota->creditsUsed($company));
        $this->assertSame(82, $quota->creditsRemaining($company));
        $this->assertTrue($quota->canConsume($company, AiQuotaService::ACTION_COURSE));
    }

    public function test_payload_exposes_credits_and_costs(): void
    {
        $company = $this->makeCompany();
        $quota = app(AiQuotaService::class);
        $payload = $quota->payload($company);
        $this->assertSame(100, $payload['credits']['limit']);
        $this->assertSame(0, $payload['credits']['used']);
        $this->assertSame(15, $payload['costs']['course_generation']);
        $this->assertSame(3, $payload['costs']['test_generation']);
        $this->assertSame(1, $payload['costs']['tutor']);
        $this->assertSame(6, $payload['actions']['course_generation']['remaining']); // floor(100/15)
    }
}
