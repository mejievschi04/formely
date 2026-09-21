<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Services\PlanEntitlementService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCompanyFeature
{
    public function __construct(
        private PlanEntitlementService $entitlements
    ) {}

    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if ($user->isPlatformAdmin()) {
            abort(403, 'Operatorul platformei nu accesează funcțiile academiei.');
        }

        $company = $user->company_id
            ? Company::withoutGlobalScopes()->find($user->company_id)
            : null;

        if (! $company || ! $company->isUsable()) {
            abort(403, 'Compania nu este activă.');
        }

        if (! $this->entitlements->companyCan($company, $feature)) {
            abort(403, 'Această funcție nu este inclusă în planul tău.');
        }

        return $next($request);
    }
}
