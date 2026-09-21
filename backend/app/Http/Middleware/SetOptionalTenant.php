<?php

namespace App\Http\Middleware;

use App\Support\DefaultCompany;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * For public catalog routes: scope to the authenticated user's company,
 * or fall back to the default company (never unscoped cross-tenant dump).
 */
class SetOptionalTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user()
            ?? $request->user('sanctum')
            ?? auth('web')->user();

        if ($user) {
            TenantContext::setFromUser($user);
        } else {
            $defaultId = DefaultCompany::id();
            if ($defaultId) {
                TenantContext::setCompanyId($defaultId);
            } else {
                TenantContext::denyAll();
            }
        }

        try {
            return $next($request);
        } finally {
            TenantContext::clear();
        }
    }
}
