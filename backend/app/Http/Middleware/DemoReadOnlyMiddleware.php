<?php

namespace App\Http\Middleware;

use App\Models\Company;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Academia demo (marketing): GET liber, mutațiile sunt respinse — modificările nu se salvează.
 */
class DemoReadOnlyMiddleware
{
    /** Rute unde scrierea e permisă (auth / sesiune). */
    private const ALLOWED_PATHS = [
        'api/auth/logout',
        'api/csrf-cookie',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $path = trim($request->path(), '/');
        foreach (self::ALLOWED_PATHS as $allowed) {
            if ($path === $allowed || str_starts_with($path, $allowed.'/')) {
                return $next($request);
            }
        }

        $user = $request->user();
        if (! $user?->company_id) {
            return $next($request);
        }

        $company = Company::query()->find($user->company_id);
        if (! $company || ! $company->isDemoAcademy()) {
            return $next($request);
        }

        return response()->json([
            'message' => 'Modul demo: modificările nu se salvează. Explorează liber — datele rămân ca în tur.',
            'error' => 'Modul demo: modificările nu se salvează. Explorează liber — datele rămân ca în tur.',
            'demo_readonly' => true,
        ], 403);
    }
}
