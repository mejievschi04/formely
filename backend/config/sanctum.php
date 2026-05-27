<?php

/**
 * Evităm `Sanctum::currentApplicationUrlWithPort()` aici: la `migrate` / `config:cache` fișierul de config
 * se încarcă foarte devreme; dacă autoload-ul sau pachetul lipsește parțial, apare „Class Sanctum not found”.
 * Logica este aceeași ca în Laravel\Sanctum\Sanctum::currentApplicationUrlWithPort().
 */
$defaultStatefulDomains = 'localhost,localhost:3000,localhost:5173,127.0.0.1,127.0.0.1:8000,::1';
$appUrl = env('APP_URL');
if (is_string($appUrl) && $appUrl !== '') {
    $host = parse_url($appUrl, PHP_URL_HOST);
    if (is_string($host) && $host !== '') {
        $port = parse_url($appUrl, PHP_URL_PORT);
        $defaultStatefulDomains .= ','.$host.($port ? ':'.$port : '');
    }
}

$sanctumEnv = env('SANCTUM_STATEFUL_DOMAINS');
$statefulBase = is_string($sanctumEnv) && $sanctumEnv !== ''
    ? $sanctumEnv
    : $defaultStatefulDomains;

$statefulList = array_filter(array_map('trim', explode(',', $statefulBase)));

/** Host (+ opțional port) din APP_URL / FRONTEND_URL — mereu unite la listă, ca să nu lipsească domeniul producției dacă SANCTUM_* e incomplet. */
$hostsFromEnvUrls = function (?string $raw): array {
    $out = [];
    $wwwVariants = function (string $host): array {
        if ($host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
            return [];
        }

        return str_starts_with($host, 'www.')
            ? [substr($host, 4)]
            : ['www.'.$host];
    };

    if (! is_string($raw) || $raw === '') {
        return $out;
    }
    foreach (explode(',', $raw) as $segment) {
        $segment = trim($segment);
        if ($segment === '') {
            continue;
        }
        $forParse = str_contains($segment, '://') ? $segment : 'https://'.$segment;
        $host = parse_url($forParse, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            continue;
        }

        $out[] = $host;
        foreach ($wwwVariants($host) as $variantHost) {
            $out[] = $variantHost;
        }

        $port = parse_url($forParse, PHP_URL_PORT);
        if ($port) {
            $out[] = $host.':'.$port;
            foreach ($wwwVariants($host) as $variantHost) {
                $out[] = $variantHost.':'.$port;
            }
        }
    }

    return $out;
};

$stateful = array_values(array_unique(array_filter(array_merge(
    $statefulList,
    $hostsFromEnvUrls(env('APP_URL')),
    $hostsFromEnvUrls(env('FRONTEND_URL'))
))));

return [

    'stateful' => $stateful,

    'guard' => ['web'],

    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],

];
