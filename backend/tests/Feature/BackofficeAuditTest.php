<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Jurnalul backoffice-ului arată acțiunile platformei (nu e filtrat ca datele unei academii). */
class BackofficeAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_platform_audit_lists_platform_actions(): void
    {
        $operator = User::factory()->create(['role' => 'platform_operator', 'company_id' => null]);

        $this->actingAs($operator, 'sanctum')->postJson('/api/platform/companies', [
            'name' => 'Academia Audit',
            'slug' => 'academia-audit',
            'plan' => 'academie',
            'owner_email' => 'owner@audit.test',
        ])->assertCreated();

        $res = $this->actingAs($operator, 'sanctum')->getJson('/api/platform/activity-logs')->assertOk();

        $this->assertContains('platform.company_created', array_column($res->json('data'), 'action'));
        $this->assertContains('platform.company_created', $res->json('filters.actions'));
        $this->assertSame($operator->email, $res->json('data.0.user.email'));

        $byOperator = $this->actingAs($operator, 'sanctum')
            ->getJson('/api/platform/activity-logs?q='.urlencode($operator->email))->assertOk();
        $this->assertNotEmpty($byOperator->json('data'));
    }
}
