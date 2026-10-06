<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Acțiunile care în Volta sunt ale adminului, dar în Formely privesc toată platforma. */
class TenantPlatformActionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_academy_admin_cannot_import_backup_change_global_settings_or_clear_cache(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->assertNotNull($admin->company_id);

        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('backup.json', json_encode([
            'export_date' => now()->toISOString(),
        ]));

        $this->actingAs($admin, 'sanctum')
            ->post('/api/admin/import', ['backup_file' => $file], ['Accept' => 'application/json'])
            ->assertForbidden();
        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', ['registration_enabled' => false])
            ->assertForbidden();
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/system/clear-cache')
            ->assertForbidden();
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/settings')
            ->assertOk();
    }

    public function test_academy_sees_only_its_own_settings_and_can_toggle_its_emails(): void
    {
        \App\Models\Setting::set('backup_frequency', 'weekly', 'string');
        $admin = User::factory()->create(['role' => 'admin']);

        $settings = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/settings')->assertOk()->json();
        $this->assertSame(['email_notifications'], array_keys($settings));

        $export = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/export')->assertOk()->json('settings');
        $this->assertSame(['email_notifications'], array_keys($export));

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', ['email_notifications' => false])
            ->assertOk();
        $this->assertFalse((bool) \App\Models\Company::find($admin->company_id)->email_notifications);
        $this->assertTrue((bool) \App\Models\Setting::get('email_notifications', true), 'comutatorul platformei rămâne neatins');
    }

    public function test_emails_follow_the_recipient_academy_switch(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $quiet = \App\Models\Company::create(['name' => 'Fără emailuri', 'slug' => 'fara-emailuri', 'status' => 'active', 'plan' => 'business', 'email_notifications' => false]);
        $muted = User::factory()->create(['company_id' => $quiet->id, 'status' => 'active']);
        $loud = User::factory()->create(['status' => 'active']);

        $service = app(\App\Services\EmailNotificationService::class);
        $service->sendToUser($muted, 'Subiect', 'Corp');
        $service->sendToUser($loud, 'Subiect', 'Corp');

        \Illuminate\Support\Facades\Mail::assertQueued(\App\Mail\VoltaUserNotificationMail::class, 1);
        \Illuminate\Support\Facades\Mail::assertQueued(\App\Mail\VoltaUserNotificationMail::class, fn ($mail) => $mail->hasTo($loud->email));
    }
}
