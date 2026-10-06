<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Rutele SaaS (backoffice, branding, plan, lead-uri) răspund fără erori pe codul aliniat cu Volta. */
class SaasEndpointsSmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_platform_operator_endpoints_respond(): void
    {
        $operator = User::factory()->create(['role' => 'platform_operator', 'company_id' => null]);

        foreach (['/api/platform/overview', '/api/platform/plans', '/api/platform/activity-logs', '/api/platform/companies', '/api/platform/leads'] as $url) {
            $this->actingAs($operator, 'sanctum')->getJson($url)->assertOk();
        }
        $this->actingAs($operator, 'sanctum')->getJson('/api/platform/companies/1')->assertOk();
    }

    public function test_academy_admin_branding_and_entitlements(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/company/entitlements')
            ->assertOk()->assertJsonPath('entitlements.plan', 'business');
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/company/branding')->assertOk();
        $this->actingAs($admin, 'sanctum')->putJson('/api/admin/company/branding', ['name' => 'Academia Mea'])
            ->assertOk()->assertJsonPath('company.name', 'Academia Mea');
        $this->actingAs($admin, 'sanctum')
            ->post('/api/admin/company/branding/logo', ['logo' => UploadedFile::fake()->image('logo.png')], ['Accept' => 'application/json'])
            ->assertOk();
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/company/branding/logo')->assertOk();

        $this->actingAs($admin, 'sanctum')->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.company.name', 'Academia Mea')
            ->assertJsonPath('user.is_platform_admin', false)
            ->assertJsonPath('user.entitlements.features.library', true);
    }

    public function test_instructor_cannot_change_branding(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $this->actingAs($instructor, 'sanctum')->putJson('/api/admin/company/branding', ['name' => 'X'])->assertForbidden();
    }

    public function test_public_branding_plans_and_lead_with_notification(): void
    {
        Mail::fake();
        config(['formely.leads_notify_email' => 'sales@formely.test']);

        $this->getJson('/api/branding/default')->assertOk();
        $this->getJson('/api/plans')->assertOk()->assertJsonStructure(['public_register_enabled', 'plans']);

        $this->postJson('/api/leads', [
            'name' => 'Ana Pop',
            'email' => 'ana@client.test',
            'company_name' => 'Client SRL',
            'privacy_accepted' => true,
        ])->assertCreated();

        Mail::assertQueued(\App\Mail\VoltaUserNotificationMail::class);
    }

    /** Formely nu are mesagerie între utilizatori (în Volta există); rutele nu trebuie să revină la sincronizări. */
    public function test_messaging_api_is_not_exposed(): void
    {
        $user = User::factory()->create(['role' => 'student']);

        $this->actingAs($user, 'sanctum')->getJson('/api/messages/conversations')->assertNotFound();
        $this->actingAs($user, 'sanctum')->getJson('/api/messages/unread-count')->assertNotFound();
        $this->actingAs($user, 'sanctum')->postJson('/api/messages/conversations', ['participant_id' => $user->id])->assertNotFound();
    }

    public function test_suspended_platform_operator_loses_backoffice_access(): void
    {
        $operator = User::factory()->create([
            'role' => 'platform_operator',
            'company_id' => null,
            'status' => 'suspended',
        ]);

        $this->actingAs($operator, 'sanctum')->getJson('/api/platform/overview')->assertForbidden();
        $this->actingAs($operator, 'sanctum')->getJson('/api/platform/companies')->assertForbidden();
    }
}
