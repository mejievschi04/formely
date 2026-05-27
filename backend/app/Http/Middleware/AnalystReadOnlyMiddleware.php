<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Rolul analyst: doar GET / HEAD / OPTIONS pe rutele admin. */
class AnalystReadOnlyMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth()->user();
        if (! $user || ! $user->isAnalyst()) {
            return $next($request);
        }

        if (in_array($request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        return response()->json([
            'error' => 'Contul de analist este doar în citire. Nu poți modifica sau adăuga date.',
        ], 403);
    }
}
