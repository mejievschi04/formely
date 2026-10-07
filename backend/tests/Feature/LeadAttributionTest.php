<?php

namespace Tests\Feature;

use App\Models\Lead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LeadAttributionTest extends TestCase
{
    use RefreshDatabase;

    public function test_lead_keeps_known_campaign_params_only(): void
    {
        Mail::fake();

        $this->postJson('/api/leads', [
            'name' => 'Ion HR',
            'email' => 'ion@firma.example',
            'privacy_accepted' => true,
            'attribution' => [
                'utm_source' => 'facebook',
                'utm_campaign' => 'onboarding-oct',
                'fbclid' => str_repeat('a', 400),
                'evil' => 'x',
            ],
        ])->assertCreated();

        $lead = Lead::firstOrFail();
        $this->assertSame('facebook', $lead->attribution['utm_source']);
        $this->assertSame(255, mb_strlen($lead->attribution['fbclid']));
        $this->assertArrayNotHasKey('evil', $lead->attribution);
        $this->assertSame('facebook · onboarding-oct', $lead->toPlatformArray()['source_label']);
    }

    public function test_lead_without_attribution_still_saves(): void
    {
        $this->postJson('/api/leads', [
            'name' => 'Ana',
            'email' => 'ana@firma.example',
            'privacy_accepted' => true,
            'attribution' => null,
        ])->assertCreated();

        $lead = Lead::firstOrFail();
        $this->assertNull($lead->attribution);
        $this->assertSame('Site', $lead->toPlatformArray()['source_label']);
    }
}
