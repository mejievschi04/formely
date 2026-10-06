<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Lead;
use App\Models\User;
use App\Services\PlanEntitlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Panoul și lista de clienți din backoffice au un număr fix de query-uri, oricâte academii există. */
class BackofficePerformanceTest extends TestCase
{
    use RefreshDatabase;

    private function makeCompanies(int $count, int $offset = 0): void
    {
        foreach (range(1, $count) as $i) {
            $n = $i + $offset;
            $company = Company::create([
                'name' => "Academia {$n}", 'slug' => "academia-{$n}", 'status' => 'active',
                'plan' => 'academie', 'max_active_learners' => 250, 'max_staff' => 6,
            ]);
            User::factory()->create(['role' => 'admin', 'company_id' => $company->id]);
            User::factory()->count(2)->create(['role' => 'student', 'company_id' => $company->id]);
        }
    }

    private function queriesFor(User $operator, string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($operator, 'sanctum')->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_overview_and_company_list_query_count_does_not_grow_with_companies(): void
    {
        $operator = User::factory()->create(['role' => 'platform_operator', 'company_id' => null]);

        $this->makeCompanies(3);
        $overviewSmall = $this->queriesFor($operator, '/api/platform/overview');
        $listSmall = $this->queriesFor($operator, '/api/platform/companies?per_page=100');

        $this->makeCompanies(15, 3);
        $overviewLarge = $this->queriesFor($operator, '/api/platform/overview');
        $listLarge = $this->queriesFor($operator, '/api/platform/companies?per_page=100');

        $this->assertSame($overviewSmall, $overviewLarge, 'overview face query-uri per academie');
        $this->assertSame($listSmall, $listLarge, 'lista de clienți face query-uri per academie');
    }

    public function test_batched_seat_usage_matches_per_company_counts(): void
    {
        $this->makeCompanies(2);
        $company = Company::query()->where('slug', 'academia-1')->firstOrFail();
        User::factory()->create(['role' => 'student', 'company_id' => $company->id, 'status' => 'suspended']);
        User::factory()->create(['role' => 'instructor', 'company_id' => $company->id]);

        $service = app(PlanEntitlementService::class);
        $seats = $service->entitlementsPayload($company)['seats'];

        $this->assertSame($service->countActiveLearners($company), $seats['learners']['used']);
        $this->assertSame($service->countStaff($company), $seats['staff']['used']);
        $this->assertSame(2, $seats['learners']['used']);
        $this->assertSame(2, $seats['staff']['used']);
        $this->assertSame($service->learnerSeatAvailable($company), $seats['learners']['available']);
        $this->assertSame($service->staffSeatAvailable($company), $seats['staff']['available']);
    }

    public function test_leads_counts_cover_all_pages_and_companies_accept_status_list(): void
    {
        $operator = User::factory()->create(['role' => 'platform_operator', 'company_id' => null]);
        foreach (range(1, 30) as $i) {
            Lead::create(['name' => "L{$i}", 'email' => "l{$i}@x.test", 'status' => $i <= 20 ? 'new' : 'lost']);
        }
        $res = $this->actingAs($operator, 'sanctum')->getJson('/api/platform/leads?per_page=10')->assertOk();
        $this->assertCount(10, $res->json('data'));
        $this->assertSame(30, $res->json('counts.all'));
        $this->assertSame(20, $res->json('counts.new'));

        Company::create(['name' => 'S', 'slug' => 's', 'status' => 'suspended', 'plan' => 'academie']);
        Company::create(['name' => 'T', 'slug' => 't', 'status' => 'trial', 'plan' => 'academie']);
        $statuses = collect($this->actingAs($operator, 'sanctum')
            ->getJson('/api/platform/companies?status=active,trial&per_page=100')->json('data'))->pluck('status')->unique()->sort()->values()->all();
        $this->assertSame(['active', 'trial'], $statuses);
    }
}
