<?php

namespace Tests\Feature;

use App\Models\SiteEvent;
use App\Models\User;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SiteStatsTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

    private const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/128.0';

    protected function setUp(): void
    {
        parent::setUp();
        TenantContext::clear();
    }

    private function track(string $type, string $ua, string $ip, array $extra = []): void
    {
        $this->withHeaders(['User-Agent' => $ua])
            ->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/track', ['type' => $type, 'path' => '/', 'lang' => 'ro'] + $extra)
            ->assertNoContent();
    }

    public function test_tracking_is_anonymous_and_ignores_bots(): void
    {
        $this->track('pageview', self::PHONE, '10.0.0.1', [
            'attribution' => ['utm_source' => 'Facebook', 'utm_campaign' => 'onboarding-oct'],
        ]);
        $this->track('pageview', 'facebookexternalhit/1.1', '10.0.0.9');

        $this->assertSame(1, SiteEvent::count());
        $event = SiteEvent::first();
        $this->assertSame('facebook', $event->source);
        $this->assertSame('onboarding-oct', $event->utm_campaign);
        $this->assertSame('mobile', $event->device);
        $this->assertSame(16, strlen($event->visitor));
        $this->assertStringNotContainsString('10.0.0.1', json_encode($event->toArray()));
    }

    public function test_referrer_is_grouped(): void
    {
        $this->track('pageview', self::LAPTOP, '10.0.0.2', ['referrer' => 'https://l.facebook.com/l.php?u=x']);
        $this->track('pageview', self::LAPTOP, '10.0.0.3', ['referrer' => 'https://www.google.ro/']);

        $this->assertSame(['facebook', 'google'], SiteEvent::orderBy('id')->pluck('source')->all());
    }

    public function test_platform_sees_funnel_and_sources(): void
    {
        $this->track('pageview', self::PHONE, '10.0.0.1', ['attribution' => ['utm_source' => 'facebook', 'utm_campaign' => 'oct']]);
        $this->track('pageview', self::PHONE, '10.0.0.1', ['attribution' => ['utm_source' => 'facebook', 'utm_campaign' => 'oct']]);
        $this->track('cta_click', self::PHONE, '10.0.0.1', ['attribution' => ['utm_source' => 'facebook', 'utm_campaign' => 'oct']]);
        $this->track('form_start', self::PHONE, '10.0.0.1', ['attribution' => ['utm_source' => 'facebook', 'utm_campaign' => 'oct']]);
        $this->track('lead', self::PHONE, '10.0.0.1', ['attribution' => ['utm_source' => 'facebook', 'utm_campaign' => 'oct']]);
        $this->track('pageview', self::LAPTOP, '10.0.0.2');

        Sanctum::actingAs(User::factory()->create([
            'email' => 'ops@formely.local',
            'password' => Hash::make('Password1'),
            'role' => UserRoles::PLATFORM_OPERATOR,
            'company_id' => null,
            'status' => 'active',
        ]));

        $response = $this->getJson('/api/platform/site-stats?days=7')->assertOk();

        $response->assertJsonPath('totals.pageviews', 3)
            ->assertJsonPath('totals.visitors', 2)
            ->assertJsonPath('totals.cta_clicks', 1)
            ->assertJsonPath('totals.form_starts', 1)
            ->assertJsonPath('totals.leads', 1)
            ->assertJsonPath('totals.conversion', 50)
            ->assertJsonPath('sources.0.label', 'facebook')
            ->assertJsonPath('sources.0.leads', 1)
            ->assertJsonPath('sources.1.label', 'Direct')
            ->assertJsonPath('campaigns.0.label', 'oct')
            ->assertJsonCount(7, 'daily');
        $this->assertSame(2, collect($response->json('daily'))->sum('visitors'));
    }

    public function test_stats_require_platform_access(): void
    {
        $this->getJson('/api/platform/site-stats')->assertUnauthorized();
    }
}
