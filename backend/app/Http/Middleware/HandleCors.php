<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class HandleCors
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Use config so it works with config:cache (env() only in config files)
        $allowedOrigins = config('cors.allowed_origins', [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
        ]);
        if (!is_array($allowedOrigins) || empty($allowedOrigins)) {
            $allowedOrigins = ['http://localhost:5173'];
        }

        $origin = $request->headers->get('Origin');
        $patterns = config('cors.allowed_origins_patterns', []);
        $allowOrigin = $origin && (
            in_array($origin, $allowedOrigins) ||
            (is_array($patterns) && collect($patterns)->contains(fn ($p) => preg_match($p, $origin)))
        ) ? $origin : $allowedOrigins[0];

        // Handle preflight requests
        if ($request->getMethod() === 'OPTIONS') {
            $allowedOrigin = $allowOrigin;
            return response('', 200)
                ->header('Access-Control-Allow-Origin', $allowedOrigin)
                ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
                ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-XSRF-TOKEN, X-CSRF-TOKEN, Accept, Origin, X-Volta-Client, X-Formely-Client')
                ->header('Access-Control-Allow-Credentials', 'true')
                ->header('Access-Control-Expose-Headers', 'X-XSRF-TOKEN, X-CSRF-TOKEN');
        }

        $response = $next($request);

        // Add CORS headers to response
        $response->headers->set('Access-Control-Allow-Origin', $allowOrigin);
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-XSRF-TOKEN, X-CSRF-TOKEN, Accept, Origin, X-Volta-Client, X-Formely-Client');
        $response->headers->set('Access-Control-Allow-Credentials', 'true');
        $response->headers->set('Access-Control-Expose-Headers', 'X-XSRF-TOKEN, X-CSRF-TOKEN');

        return $response;
    }
}

