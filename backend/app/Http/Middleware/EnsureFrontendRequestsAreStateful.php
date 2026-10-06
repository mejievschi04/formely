<?php

namespace App\Http\Middleware;

use Illuminate\Support\Str;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful as SanctumEnsureFrontendRequestsAreStateful;
use Laravel\Sanctum\Sanctum;

/**
 * Sanctum SPA: Origin/Referer + fallback pe Host (Nginx reverse proxy, același domeniu).
 * În local, originea de pe IP din LAN (telefon pe același Wi‑Fi) e tratată ca frontend.
 */
class EnsureFrontendRequestsAreStateful extends SanctumEnsureFrontendRequestsAreStateful
{
    /** Valorile din config, înainte de ajustarea per request (config() rămâne modificat pe worker). */
    private static ?bool $configuredSecure = null;

    private static ?string $configuredSameSite = null;

    public function handle($request, $next)
    {
        if (self::$configuredSecure === null) {
            self::$configuredSecure = (bool) config('session.secure');
            $sameSite = config('session.same_site');
            self::$configuredSameSite = is_string($sameSite) ? $sameSite : null;
        }

        $secure = self::$configuredSecure;
        $sameSite = self::$configuredSameSite;

        // Cookie Secure pe HTTP e ignorat de browser: sesiunea nu se salvează și fiecare POST dă 419.
        // În spatele HTTPS, trustProxies face isSecure() true din X-Forwarded-Proto.
        if (! $request->isSecure()) {
            $secure = false;
            if ($sameSite === 'none') {
                $sameSite = 'lax';
            }
        } elseif ($sameSite === 'none') {
            $secure = true;
        }

        config([
            'session.secure' => $secure,
            'session.same_site' => $sameSite,
        ]);

        return parent::handle($request, $next);
    }

    /**
     * Sanctum forțează SameSite=lax și ignoră SESSION_SAME_SITE din .env.
     */
    protected function configureSecureCookieSessions()
    {
        $sameSite = config('session.same_site');

        parent::configureSecureCookieSessions();

        if (is_string($sameSite) && $sameSite !== '') {
            config(['session.same_site' => $sameSite]);
        }
    }

    protected function frontendMiddleware()
    {
        $middleware = parent::frontendMiddleware();
        $middleware[] = ShareCsrfToken::class;

        return $middleware;
    }

    public static function fromFrontend($request): bool
    {
        if (parent::fromFrontend($request)) {
            return true;
        }

        $frontendUrl = $request->headers->get('origin') ?: $request->headers->get('referer');
        if ($frontendUrl && self::isLocalLanFrontendUrl($frontendUrl)) {
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

            $domainHost = Str::before($domain, ':');
            if ($host === $domainHost) {
                return true;
            }
        }

        return false;
    }

    private static function isLocalLanFrontendUrl(string $url): bool
    {
        // Doar în dezvoltare. APP_DEBUG pornit temporar în producție nu trebuie să lărgească originile de încredere.
        if (! app()->environment('local', 'development', 'testing')) {
            return false;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            $stripped = strtolower(preg_replace('#^https?://#i', '', $url) ?? '');
            $host = Str::before(Str::before($stripped, '/'), ':');
        }

        return self::isPrivateLanHost(strtolower((string) $host));
    }

    private static function isPrivateLanHost(string $host): bool
    {
        if ($host === 'localhost' || $host === '::1') {
            return true;
        }

        if (! filter_var($host, FILTER_VALIDATE_IP)) {
            return false;
        }

        return (bool) filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
