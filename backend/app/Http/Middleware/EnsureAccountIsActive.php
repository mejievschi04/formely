<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $status = (string) ($user->status ?? 'active');

        if ($status === 'suspended' && $user->suspended_until && now()->gte($user->suspended_until)) {
            $user->forceFill([
                'status' => 'active',
                'suspended_reason' => null,
                'suspended_until' => null,
            ])->save();

            return $next($request);
        }

        if ($status === 'pending') {
            return response()->json([
                'message' => 'Contul tău este în așteptarea aprobării.',
                'account_status' => 'pending',
            ], 403);
        }

        if ($status === 'suspended') {
            return response()->json([
                'message' => 'Contul tău a fost suspendat.',
                'account_status' => 'suspended',
            ], 403);
        }

        return $next($request);
    }
}
