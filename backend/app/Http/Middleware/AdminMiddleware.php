<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (!auth()->check()) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        if (! auth()->user()->canManagePlatformSettings()) {
            return response()->json(['error' => 'Acces interzis. Doar administratorul principal sau proprietarul companiei pot accesa această resursă.'], 403);
        }

        return $next($request);
    }
}

