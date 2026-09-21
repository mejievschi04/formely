<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Previne scurgerea tenantului între request-uri pe același worker PHP. */
class ResetTenantContext
{
    public function handle(Request $request, Closure $next): Response
    {
        TenantContext::clear();

        try {
            return $next($request);
        } finally {
            TenantContext::clear();
        }
    }
}
