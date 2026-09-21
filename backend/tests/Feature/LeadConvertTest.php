<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Lead;
use App\Models\User;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeadConvertTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
        Mail::fake();
    }

    public function test_platform_can_convert_lead_to_company(): void
    {
        $lead = Lead::create([
            'name' => 'Maria Client',
            'email' => 'maria@client.example',
            'company_name' => 'Client Academy',
            'plan_interest' => 'academie',
            'status' => 'new',
            'source' => 'website',
            'privacy_accepted_at' => now(),
        ]);

        $ops = User::factory()->create([
            'email' => 'ops@formely.local',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]);

        Sanctum::actingAs($ops);

        $response = $this->postJson('/api/platform/leads/'.$lead->id.'/convert', [
            'plan' => 'academie',
            'status' => 'trial',
        ]);

        $response->assertCreated()
            ->assertJsonPath('lead.status', 'won')
            ->assertJsonPath('company.plan', 'academie');

        $this->assertNotNull($response->json('invite_url'));
        $this->assertDatabaseHas('companies', ['slug' => 'client-academy']);
        $this->assertNotNull($lead->fresh()->company_id);
        $this->assertSame('won', $lead->fresh()->status);
    }

    public function test_lead_requires_privacy_consent(): void
    {
        $this->postJson('/api/leads', [
            'name' => 'No Consent',
            'email' => 'noconsent@example.com',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['privacy_accepted']);
    }
}
