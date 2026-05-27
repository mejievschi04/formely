<?php

/**
 * AI provider settings — read via config(), not env() in application code.
 * Required when APP_ENV=production and `php artisan config:cache` is used
 * (direct env() outside config files returns null).
 */
return [
    'provider' => env('AI_PROVIDER', 'groq'),

    'verify_ssl' => filter_var(env('AI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN),

    'groq' => [
        'api_key' => env('GROQ_API_KEY', ''),
        'api_url' => rtrim((string) env('GROQ_API_URL', 'https://api.groq.com/openai/v1'), '/'),
        'model' => env('GROQ_MODEL', 'llama-3.1-8b-instant'),
        'creator_model' => env('GROQ_CREATOR_MODEL'),
        'creator_quality_model' => env('GROQ_CREATOR_QUALITY_MODEL'),
        'fallback_models' => env('GROQ_FALLBACK_MODELS', ''),
    ],

    'openai' => [
        'api_key' => env('OPENAI_API_KEY', ''),
        'api_url' => rtrim((string) env('OPENAI_API_URL', 'https://api.openai.com/v1'), '/'),
        'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
        'creator_model' => env('OPENAI_CREATOR_MODEL'),
        'creator_quality_model' => env('OPENAI_CREATOR_QUALITY_MODEL'),
        'fallback_models' => env('OPENAI_FALLBACK_MODELS', ''),
    ],
];
