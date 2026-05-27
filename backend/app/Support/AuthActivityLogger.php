<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AuthActivityLogger
{
    public static function logLoggedIn(User $user, Request $request): void
    {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'logged_in',
            'model_type' => 'User',
            'model_id' => $user->id,
            'description' => "{$user->name} s-a autentificat",
            'new_values' => [
                'role' => $user->role,
                'email' => $user->email,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }

    public static function logLoggedOut(User $user, Request $request): void
    {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'logged_out',
            'model_type' => 'User',
            'model_id' => $user->id,
            'description' => "{$user->name} s-a deconectat",
            'new_values' => [
                'role' => $user->role,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }
}
