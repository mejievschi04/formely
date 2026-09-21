<?php

namespace App\Support;

use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PlatformActivityLogger
{
    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public static function log(
        Request $request,
        string $action,
        string $description,
        ?string $modelType = null,
        ?int $modelId = null,
        ?array $old = null,
        ?array $new = null,
    ): void {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        $user = $request->user();

        ActivityLog::create([
            'user_id' => $user?->id,
            'action' => $action,
            'model_type' => $modelType,
            'model_id' => $modelId,
            'description' => $description,
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }
}
