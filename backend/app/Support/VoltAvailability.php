<?php

namespace App\Support;

class VoltAvailability
{
    public static function isConfigured(): bool
    {
        $provider = strtolower(trim((string) config('ai.provider', 'groq')));
        if (! in_array($provider, ['groq', 'openai', 'huggingface'], true)) {
            $provider = 'groq';
        }

        return trim((string) config("ai.{$provider}.api_key", '')) !== '';
    }
}
