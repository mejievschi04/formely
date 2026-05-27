<?php

namespace App\Http\Middleware;

use Illuminate\Support\Str;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful as SanctumEnsureFrontendRequestsAreStateful;
use Laravel\Sanctum\Sanctum;

/**
 * Sanctum SPA: Origin/Referer + fallback pe Host (Nginx reverse proxy, același domeniu).
 */
class EnsureFrontendRequestsAreStateful extends SanctumEnsureFrontendRequestsAreStateful
{
    public static function fromFrontend($request): bool
    {
        if (parent::fromFrontend($request)) {
            return true;
        }

        $host = strtolower((string) $request->getHttpHost());
        if ($host === '') {
            return false;
        }

        foreach (config('sanctum.stateful', []) as $domain) {
            $domain = strtolower(trim((string) $domain));
            if ($domain === '') {
                continue;
            }

            if ($domain === Sanctum::$currentRequestHostPlaceholder) {
                return true;
            }

            if ($host === $domain) {
                return true;
            }

            if (str_contains($domain, ':') && $host === $domain) {
                return true;
            }

            $domainHost = Str::before($domain, ':');
            if ($host === $domainHost) {
                return true;
            }
        }

        return false;
    }
}
