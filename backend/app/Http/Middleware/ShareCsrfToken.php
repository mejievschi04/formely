<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * SPA citește tokenul plain din header. Cookie-ul XSRF-TOKEN e criptat și,
 * după URL-decode, decriptarea eșuează des (semnul + devine spațiu) → 419.
 */
class ShareCsrfToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $token = $request->hasSession() ? $request->session()->token() : null;
        if (is_string($token) && $token !== '') {
            $response->headers->set('X-CSRF-TOKEN', $token);
        }

        return $response;
    }
}
