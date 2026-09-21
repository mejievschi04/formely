<?php

namespace App\Http\Middleware;

use App\Support\UserRoles;
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

        $user = auth()->user();
        if ($user->isPlatformAdmin() && ! $request->is('api/admin/platform', 'api/admin/platform/*', 'api/platform', 'api/platform/*')) {
            return response()->json([
                'error' => 'Operatorul platformei accesează doar consola de control.',
            ], 403);
        }

        $role = $user->role ?? UserRoles::EMPLOYEE;
        if (! in_array($role, UserRoles::staffRoles(), true)) {
            return response()->json([
                'error' => 'Acces interzis. Nu ai drepturi pentru zona de administrare.',
            ], 403);
        }

        return $next($request);
    }
}
