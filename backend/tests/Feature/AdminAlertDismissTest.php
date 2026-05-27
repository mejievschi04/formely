<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminAlertDismissTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_dismiss_dashboard_alert(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/alerts/dismiss', [
                'alert_id' => 'alert_low_completion_99',
            ])
            ->assertOk();

        $this->assertDatabaseHas('dismissed_dashboard_alerts', [
            'user_id' => $admin->id,
            'alert_id' => 'alert_low_completion_99',
        ]);
    }

    public function test_dismissed_alerts_excluded_from_filtered_list(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        DB::table('dismissed_dashboard_alerts')->insert([
            'user_id' => $admin->id,
            'alert_id' => 'alert_test_1',
            'dismissed_at' => now(),
        ]);

        $alerts = [
            ['id' => 'alert_test_1', 'title' => 'A'],
            ['id' => 'alert_test_2', 'title' => 'B'],
        ];

        $filtered = \App\Http\Controllers\Api\Admin\AdminAlertController::filterDismissed($alerts, $admin->id);

        $this->assertCount(1, $filtered);
        $this->assertSame('alert_test_2', $filtered[0]['id']);
    }
}
