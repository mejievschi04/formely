<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class AiTestGenerator
{
    public function __construct(private AiTestQuality $quality) {}

    public function generate(array $brief, string $prompt, array $existing = [], ?string $operation = null): array
    {
        $provider = config('ai.provider');
        if (!in_array($provider, ['openai', 'groq'], true) || !config("ai.$provider.api_key")) {
            abort(503, 'Configurează un provider OpenAI-compatible pentru generarea testelor.');
        }
        $language = ['ro' => 'română', 'en' => 'English', 'ru' => 'русский'][$brief['language']] ?? 'română';
        $system = VoltPromptService::buildTestPrompt('')."\nReturnează exact {$brief['question_count']} întrebări. Limba obligatorie pentru titlu, întrebări, opțiuni și explicații: {$language}.";
        if ($existing) $system .= $operation === 'append'
            ? "\nReturnează numai întrebările NOI, fără a le repeta pe cele existente."
            : "\nReturnează lista completă care va înlocui întrebările existente.";
        $messages = [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode(['request' => $prompt, 'test_brief' => $brief, 'existing_test' => $existing], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
        ];
        $deadline = microtime(true) + min(180, max(10, (int) config('ai.timeouts.request', 180)));
        $error = 'Testul nu a putut fi validat.';
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $remaining = (int) floor($deadline - microtime(true));
            if ($remaining < 5) break;
            $response = Http::withToken(config("ai.$provider.api_key"))->acceptJson()
                ->withOptions(['verify' => (bool) config('ai.verify_ssl', true)])
                ->timeout($remaining)->connectTimeout(min(15, $remaining))
                ->post(rtrim(config("ai.$provider.api_url"), '/').'/chat/completions', [
                    'model' => config("ai.$provider.creator_model") ?: config("ai.$provider.model"),
                    'messages' => $messages, 'temperature' => 0.2, 'stream' => false,
                    'max_tokens' => 8192, 'response_format' => ['type' => 'json_object'],
                ]);
            abort_unless($response->successful(), 503, 'Furnizorul AI nu a putut genera testul (HTTP '.$response->status().'). Reîncearcă.');
            $raw = data_get($response->json(), 'choices.0.message.content');
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            try {
                if (data_get($response->json(), 'choices.0.finish_reason') === 'length') throw new \RuntimeException('Răspunsul este trunchiat. Returnează testul complet, cu explicații concise.');
                if (!is_array($decoded) || array_is_list($decoded)) throw new \RuntimeException('Returnează un singur obiect JSON valid.');
                $validated = $this->quality->validate($decoded, (int) $brief['question_count']);
                if ($operation === 'append' && !($validated['needs_more_context'] ?? false)) {
                    $seen = array_map(fn ($question) => mb_strtolower(\App\Support\VisibleText::normalize((string) ($question['content'] ?? $question['question'] ?? ''))), $existing['questions'] ?? []);
                    foreach ($validated['questions'] as $question) {
                        if (in_array(mb_strtolower(\App\Support\VisibleText::normalize($question['question'])), $seen, true)) throw new \RuntimeException('Returnează întrebări noi; nu repeta întrebările testului existent.');
                    }
                }
                return $validated;
            } catch (\RuntimeException $e) {
                $error = $e->getMessage();
            }
            if ($attempt < 3) {
                if (is_string($raw)) $messages[] = ['role' => 'assistant', 'content' => $raw];
                $messages[] = ['role' => 'user', 'content' => 'Corectează: '.$error.' Returnează întregul test JSON, nu doar modificările.'];
            }
        }

        throw ValidationException::withMessages(['ai_response' => $error]);
    }
}
