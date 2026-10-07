<?php

namespace App\Http\Middleware;

use App\Support\VoltAvailability;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Rutele Volt (AI) nu există cât timp AI-ul e oprit (AI_ENABLED) sau nu are cheie de API. */
class EnsureVoltEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! VoltAvailability::isConfigured()) {
            abort(404);
        }

        return $next($request);
    }
}
