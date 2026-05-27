<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminAlertController extends Controller
{
    public function dismiss(Request $request)
    {
        $validated = $request->validate([
            'alert_id' => 'required|string|max:128',
        ]);

        if (! Schema::hasTable('dismissed_dashboard_alerts')) {
            return response()->json(['message' => 'Alertă închisă']);
        }

        DB::table('dismissed_dashboard_alerts')->updateOrInsert(
            [
                'user_id' => $request->user()->id,
                'alert_id' => $validated['alert_id'],
            ],
            [
                'dismissed_at' => now(),
            ]
        );

        return response()->json(['message' => 'Alertă închisă', 'alert_id' => $validated['alert_id']]);
    }

    /**
     * @return array<int, string>
     */
    public static function dismissedIdsForUser(int $userId): array
    {
        if (! Schema::hasTable('dismissed_dashboard_alerts')) {
            return [];
        }

        return DB::table('dismissed_dashboard_alerts')
            ->where('user_id', $userId)
            ->pluck('alert_id')
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $alerts
     * @return array<int, array<string, mixed>>
     */
    public static function filterDismissed(array $alerts, int $userId): array
    {
        $dismissed = array_flip(self::dismissedIdsForUser($userId));

        return array_values(array_filter($alerts, function ($alert) use ($dismissed) {
            $id = (string) ($alert['id'] ?? '');

            return $id !== '' && ! isset($dismissed[$id]);
        }));
    }
}
