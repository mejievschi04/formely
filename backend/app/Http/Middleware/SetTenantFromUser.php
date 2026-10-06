<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetTenantFromUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Academie suspendată / trial expirat: blocăm API-ul (logout rămâne permis).
        if ($user && $user->company_id && ! $request->is('api/auth/logout')) {
            $company = Company::query()->find($user->company_id);
            if ($company && ! $company->isUsable()) {
                return response()->json([
                    'error' => 'Organizație indisponibilă',
                    'message' => $company->isTrialExpired()
                        ? 'Perioada de demo s-a încheiat. Contactează Formely pentru activare.'
                        : 'Organizația ta este suspendată. Contactează Formely pentru reactivare.',
                    'company_suspended' => true,
                    'trial_expired' => $company->isTrialExpired(),
                ], 403);
            }
        }

        TenantContext::setFromUser($user);

        try {
            return $next($request);
        } finally {
            TenantContext::clear();
        }
    }
}
