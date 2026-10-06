<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Acțiuni care în Volta sunt ale adminului, dar în Formely privesc toată platforma
 * (setări globale, import backup, golire cache): nu sunt permise din academii.
 */
class BlockTenantPlatformActions
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->company_id) {
            abort(403, 'Această acțiune afectează toată platforma și este gestionată de echipa Formely.');
        }

        return $next($request);
    }
}
