<?php

/**
 * AI provider settings — read via config(), not env() in application code.
 * Required when APP_ENV=production and `php artisan config:cache` is used
 * (direct env() outside config files returns null).
 */
return [
    // Comutatorul general pentru Volt (AI). Oprit implicit: fără AI_ENABLED=true nu pornește nicio
    // funcție AI, chiar dacă există chei de API — rutele AI răspund 404, iar interfața le ascunde.
    'enabled' => filter_var(env('AI_ENABLED', false), FILTER_VALIDATE_BOOLEAN),

    'provider' => env('AI_PROVIDER', 'groq'),

    'verify_ssl' => filter_var(env('AI_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN),

    'huggingface' => [
        'api_key' => env('HUGGINGFACE_API_KEY', ''),
        'api_url' => rtrim((string) env('HUGGINGFACE_API_URL', 'https://router.huggingface.co'), '/'),
        'model' => env('HUGGINGFACE_MODEL', 'meta-llama/Meta-Llama-3.1-8B-Instruct'),
    ],

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
    // Timeout-uri în secunde. guided_creation = 0: fără limită separată pentru crearea ghidată.
    'timeouts' => [
        'request' => (int) env('AI_REQUEST_TIMEOUT', 180),
        'connect' => (int) env('AI_CONNECT_TIMEOUT', 15),
        'tutor' => (int) env('AI_TUTOR_TIMEOUT', 120),
        'guided_creation' => (int) env('AI_GUIDED_CREATION_TIMEOUT', 0),
    ],

    'max_tokens' => [
        'guided' => (int) env('AI_GUIDED_MAX_TOKENS', 8192),
        'admin_tutor' => (int) env('AI_ADMIN_TUTOR_MAX_TOKENS', 900),
        'builder_diff' => (int) env('AI_BUILDER_DIFF_MAX_TOKENS', 6000),
    ],

    // Reîncercări la limita de rată (ex. tier-ul gratuit Groq) în crearea ghidată.
    'guided_rate_limit' => [
        'retries' => (int) env('AI_GUIDED_RATE_LIMIT_RETRIES', 2),
        'max_backoff' => (int) env('AI_GUIDED_RATE_LIMIT_MAX_BACKOFF', 15),
    ],

    // null = valoarea implicită din AIController.
    'min_lesson_lines' => env('AI_MIN_LESSON_LINES'),

    /*
     * Embedding-uri pentru căutarea semantică a lui Volt. Groq nu oferă embedding-uri: fără
     * AI_EMBEDDING_PROVIDER, ele sunt active doar cu AI_PROVIDER=openai. Altfel căutarea folosește
     * cuvinte cheie (fără apelul care eșua la fiecare întrebare).
     * Furnizor propriu (ex. Ollama): AI_EMBEDDING_PROVIDER=custom, AI_EMBEDDING_API_URL, AI_EMBEDDING_MODEL.
     */
    'embedding' => [
        'provider' => env('AI_EMBEDDING_PROVIDER'),
        'api_url' => env('AI_EMBEDDING_API_URL'),
        'api_key' => env('AI_EMBEDDING_API_KEY'),
        'model' => env('AI_EMBEDDING_MODEL'),
        'openai_model' => env('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
    ],
];
