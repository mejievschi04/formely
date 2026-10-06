<?php

/**
 * CORS for the SPA: cookies need explicit origins, not `*`.
 *
 * @return array{
 *     paths: list<string>,
 *     allowed_methods: list<string>,
 *     allowed_origins: list<string>,
 *     allowed_origins_patterns: list<string>,
 *     allowed_headers: list<string>,
 *     exposed_headers: list<string>,
 *     max_age: int,
 *     supports_credentials: bool
 * }
 */
return (static function (): array {
    $originInputs = array_filter([
        env('APP_URL'),
        env('FRONTEND_URL'),
    ]);

    $wwwVariants = static function (string $host): array {
        if ($host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
            return [];
        }

        return str_starts_with($host, 'www.')
            ? [substr($host, 4)]
            : ['www.'.$host];
    };

    $normalizeOrigin = static function (string $raw) use ($wwwVariants): array {
        $origins = [];

        foreach (explode(',', $raw) as $segment) {
            $segment = trim($segment);
            if ($segment === '') {
                continue;
            }

            $forParse = str_contains($segment, '://') ? $segment : 'https://'.$segment;
            $scheme = parse_url($forParse, PHP_URL_SCHEME) ?: 'https';
            $host = parse_url($forParse, PHP_URL_HOST);
            if (! is_string($host) || $host === '') {
                continue;
            }

            $port = parse_url($forParse, PHP_URL_PORT);
            $origin = $scheme.'://'.$host.($port ? ':'.$port : '');
            $origins[] = $origin;

            foreach ($wwwVariants($host) as $variantHost) {
                $origins[] = $scheme.'://'.$variantHost.($port ? ':'.$port : '');
            }
        }

        return $origins;
    };

    $allowedOrigins = [];
    foreach ($originInputs as $originInput) {
        if (is_string($originInput)) {
            $allowedOrigins = array_merge($allowedOrigins, $normalizeOrigin($originInput));
        }
    }

    $allowedOrigins = array_values(array_unique(array_filter($allowedOrigins)));
    if ($allowedOrigins === []) {
        $allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
        ];
    }

    $originPatterns = [
        '#^https?://.*\.ngrok-free\.app$#',
        '#^https?://.*\.ngrok\.io$#',
        '#^https?://.*\.ngrok\.app$#',
    ];

    if (env('APP_ENV') === 'local' || filter_var(env('APP_DEBUG', false), FILTER_VALIDATE_BOOLEAN)) {
        $originPatterns[] = '#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#';
        $originPatterns[] = '#^https?://((10|127)\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$#';
    }

    return [
        'paths' => ['api/*', 'sanctum/csrf-cookie'],
        'allowed_methods' => ['*'],
        'allowed_origins' => $allowedOrigins,
        'allowed_origins_patterns' => $originPatterns,
        'allowed_headers' => ['*'],
        'exposed_headers' => [],
        'max_age' => 0,
        'supports_credentials' => true,
    ];
})();
