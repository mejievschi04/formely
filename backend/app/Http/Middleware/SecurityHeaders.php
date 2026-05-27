<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
	public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $isBuilderMediaPreview = $request->is('api/builder-media/*');

        // Security headers
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        if (!$isBuilderMediaPreview) {
            $response->headers->set('X-Frame-Options', 'DENY');
        } else {
            $response->headers->remove('X-Frame-Options');
        }
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        
        // CSP: connect-src trebuie să includă API-ul real pe producție (nu doar localhost).
        $connect = collect(['\'self\'']);
        $appUrl = config('app.url');
        if (is_string($appUrl) && $appUrl !== '') {
            $connect->push(rtrim($appUrl, '/'));
        }
        foreach (config('cors.allowed_origins', []) as $origin) {
            if (is_string($origin) && str_starts_with($origin, 'http')) {
                $connect->push(rtrim($origin, '/'));
            }
        }
        foreach (['http://localhost:8000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'] as $dev) {
            $connect->push($dev);
        }
        $connectSrc = $connect->filter()->unique()->implode(' ');
        $csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src {$connectSrc};";
        $response->headers->set('Content-Security-Policy', $csp);

        // Strict Transport Security (only for HTTPS in production)
        if (config('app.env') === 'production' && $request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
