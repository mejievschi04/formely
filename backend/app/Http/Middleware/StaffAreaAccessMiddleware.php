<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Permite accesul la prefixul /api/admin pentru admin, instructor și analist.
 * Restricțiile pe acțiuni: AnalystReadOnlyMiddleware, InstructorContentScopeMiddleware.
 */
class StaffAreaAccessMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! auth()->check()) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        $role = auth()->user()->role ?? 'student';
        if (! in_array($role, ['admin', 'instructor', 'analyst'], true)) {
            return response()->json([
                'error' => 'Acces interzis. Nu ai drepturi pentru zona de administrare.',
            ], 403);
        }

        return $next($request);
    }
}
