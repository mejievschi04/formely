<?php

$originInputs = array_filter([
    env('APP_URL'),
    env('FRONTEND_URL'),
]);

$normalizeOrigin = function (string $raw): array {
    $origins = [];
    $wwwVariants = function (string $host): array {
        if ($host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
            return [];
        }

        return str_starts_with($host, 'www.')
            ? [substr($host, 4)]
            : ['www.'.$host];
    };

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

        // Accept both canonical and www variants. This avoids browser-specific
        // failures when users open the app from saved links with/without www.
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
if (empty($allowedOrigins)) {
    $allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
    ];
}

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Explicit origins only, because credentials/cookies require a concrete
    // Access-Control-Allow-Origin value. Built from APP_URL + FRONTEND_URL.
    'allowed_origins' => $allowedOrigins,
    
    // Permite toate domeniile ngrok (pentru development)
    'allowed_origins_patterns' => [
        '#^https?://.*\.ngrok-free\.app$#',
        '#^https?://.*\.ngrok\.io$#',
        '#^https?://.*\.ngrok\.app$#',
    ],


    'allowed_headers' => ['*'],

    // important pentru cookies/autentificare
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
