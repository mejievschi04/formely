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

        if (app()->environment(['local', 'development']) && self::requestFromPrivateLan($request)) {
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

    protected static function requestFromPrivateLan($request): bool
    {
        foreach ([$request->headers->get('origin'), $request->headers->get('referer')] as $url) {
            if (! is_string($url) || $url === '') {
                continue;
            }
            $host = parse_url($url, PHP_URL_HOST);
            if (is_string($host) && self::isPrivateLanIp($host)) {
                return true;
            }
        }

        $httpHost = (string) $request->getHttpHost();
        $host = strtolower(Str::before($httpHost, ':'));

        return $host !== '' && self::isPrivateLanIp($host);
    }

    protected static function isPrivateLanIp(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
