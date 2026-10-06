<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Înregistrează o sesiune de platformă pentru elev (deschidere app), o dată per sesiune browser/token.
 */
class StudentSessionLogger
{
    public const ACTION = 'session_started';

    public static function recordOpened(User $user, Request $request): void
    {
        if (($user->role ?? '') !== 'student') {
            return;
        }

        static $activityLogsReady = null;
        if ($activityLogsReady === null) {
            $activityLogsReady = SchemaCache::hasTable('activity_logs');
        }
        if (! $activityLogsReady) {
            return;
        }

        $sessionRef = self::sessionReference($request);
        if ($sessionRef === null) {
            return;
        }

        $dedupeKey = 'volta_student_session:' . $user->id . ':' . $sessionRef;
        $ttlMinutes = max(1, (int) config('session.lifetime', 120));
        if (! Cache::add($dedupeKey, true, now()->addMinutes($ttlMinutes))) {
            return;
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => self::ACTION,
            'model_type' => 'User',
            'model_id' => $user->id,
            'description' => "{$user->name} a deschis o sesiune",
            'new_values' => [
                'session_ref' => $sessionRef,
                'source' => $request->path(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }

    private static function sessionReference(Request $request): ?string
    {
        if ($request->hasSession() && $request->session()->getId()) {
            return 'web:' . $request->session()->getId();
        }

        $bearer = $request->bearerToken();
        if ($bearer) {
            $accessToken = PersonalAccessToken::findToken($bearer);
            if ($accessToken) {
                return 'token:' . $accessToken->id;
            }
        }

        return $request->ip() ? 'ip:' . $request->ip() : null;
    }
}
