<?php

// Live probes use synthetic data only; no course/test persistence or tenant credit use.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$options = getopt('', ['output:', 'case:', 'suite:', 'repeat:']);
$output = $options['output'] ?? sys_get_temp_dir().'/formely-ai-module';
if (!is_dir($output)) mkdir($output, 0700, true);
require __DIR__.'/ResearchAssertions.php';
$records = [];
$tokens = 0;
$calls = 0;
Illuminate\Support\Facades\Event::listen(Illuminate\Http\Client\Events\ResponseReceived::class, function ($event) use ($output, &$calls, &$tokens) {
    $tokens += (int) data_get($event->response->json(), 'usage.total_tokens', 0);
    file_put_contents($output.'/provider-'.(++$calls).'.json', json_encode($event->response->json(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
});
$material = 'Eficiența este energia utilă împărțită la energia consumată. Echipamentul A consumă 100 J și livrează 80 J utili: eficiență 80%, pierderi 20 J. Echipamentul B consumă 200 J și livrează 150 J utili: eficiență 75%, pierderi 50 J. O eficiență mai mare înseamnă o proporție mai mare de energie utilă, nu neapărat un consum total mai mic.';
$cases = [
    ['id' => 'test_ro', 'flow' => 'test', 'language' => 'ro', 'count' => 4, 'material' => $material],
    ['id' => 'test_en', 'flow' => 'test', 'language' => 'en', 'count' => 4, 'material' => $material],
    ['id' => 'test_ru', 'flow' => 'test', 'language' => 'ru', 'count' => 3, 'material' => $material],
    ['id' => 'test_insufficient', 'flow' => 'test', 'language' => 'ro', 'count' => 4, 'material' => 'Titlu: politica de retur. Regulile companiei nu au fost furnizate.'],
];
foreach (json_decode(file_get_contents(__DIR__.'/cases.json'), true, 512, JSON_THROW_ON_ERROR) as $case) {
    if (in_array($case['flow'], ['builder', 'batch', 'qa'], true)) $cases[] = $case;
}
$suite = $options['suite'] ?? 'standard';
if (!in_array($suite, ['standard', 'research', 'all'], true)) { fwrite(STDERR, "Unknown suite.\n"); exit(2); }
$researchCases = json_decode(file_get_contents(__DIR__.'/lms-research-cases.json'), true, 512, JSON_THROW_ON_ERROR);
$cases = $suite === 'research' ? $researchCases : ($suite === 'all' ? array_merge($cases, $researchCases) : $cases);
$repeat = max(1, min(5, (int) ($options['repeat'] ?? 1)));
$expanded = [];
foreach ($cases as $case) for ($run = 1; $run <= $repeat; $run++) $expanded[] = $case + ['run' => $run];
foreach ($expanded as $case) {
    if (isset($options['case']) && $options['case'] !== $case['id']) continue;
    $started = microtime(true);
    $initialCalls = $calls;
    $initialTokens = $tokens;
    $result = null;
    echo 'START '.$case['id']."\n";
    $record = ['id' => $case['id'], 'flow' => $case['flow'], 'run' => $case['run']];
    try {
        if ($case['flow'] === 'test') {
            $brief = ['topic' => $case['topic'] ?? 'Energie', 'language' => $case['language'], 'question_count' => $case['count'], 'difficulty' => 'medium', 'question_type' => 'multiple_choice', 'material' => $case['material']];
            $result = app(App\Services\AiTestGenerator::class)->generate($brief, $case['request'] ?? 'Creează testul strict din material.');
            if (($case['expect_clarification'] ?? ($case['id'] === 'test_insufficient')) !== ($result['needs_more_context'] ?? false)) throw new RuntimeException('Materialul insuficient nu a fost tratat corect.');
        } elseif ($case['flow'] === 'batch') {
            $input = $case['input'];
            $result = app(App\Services\VoltQuestionGenerationService::class)->generateQuestionsFromContent($input['material'], $input['count'], $input['difficulty'], $input['types'], 'balanced', $input['cognitive_levels'] ?? []);
            if (count($result) !== $input['count']) throw new RuntimeException('Număr incorect de întrebări în batch.');
        } elseif ($case['flow'] === 'builder') {
            $result = app(App\Services\AiBuilderGenerator::class)->generate([['role' => 'system', 'content' => App\Services\VoltPromptService::buildBuilderDiffPrompt()], ['role' => 'user', 'content' => json_encode($case['input'], JSON_UNESCAPED_UNICODE)]]);
            if (!empty($result['clarification_question'])) {
                if ($case['id'] !== 'builder_ambiguous') throw new RuntimeException('Clarificare inutilă: '.$result['clarification_question']);
            } else {
                $plan = app(App\Services\AiCoursePlanService::class)->normalize($result);
                if ($case['id'] === 'builder_ambiguous') throw new RuntimeException('Ținta ambiguă nu a fost clarificată.');
                if ($case['id'] === 'builder_procedure_with_explanation_and_check') {
                    $content = mb_strtolower($plan['operations'][0]['content'] ?? '');
                    if (preg_match('/sms|telefon|complex|litere mari|recomandat/u', $content)) throw new RuntimeException('Lecția inventează mecanisme/cerințe sau slăbește o obligație din sursă.');
                }
                if ($case['id'] === 'builder_unsaved') {
                    $operation = $plan['operations'][0] ?? [];
                    if (($operation['op'] ?? '') !== 'update_lesson' || (int) ($operation['lesson_id'] ?? 0) !== 21 || !str_contains($operation['content'] ?? '', 'Această regulă a fost adăugată acum')) throw new RuntimeException('Draftul sau ținta editării nu au fost păstrate.');
                }
            }
        } else {
            $provider = config('ai.provider');
            $system = App\Services\VoltPromptService::buildAdminTutorPrompt();
            $response = Illuminate\Support\Facades\Http::withToken(config("ai.$provider.api_key"))->timeout(120)
                ->withOptions(['verify' => (bool) config('ai.verify_ssl', true)])
                ->post(rtrim(config("ai.$provider.api_url"), '/').'/chat/completions', [
                    'model' => config("ai.$provider.model"), 'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => json_encode($case['input'], JSON_UNESCAPED_UNICODE)]],
                    'temperature' => 0.2, 'max_tokens' => 1500,
                ]);
            if (data_get($response->json(), 'choices.0.finish_reason') !== 'stop') throw new RuntimeException('Răspuns Q&A incomplet.');
            if (!$response->successful()) throw new RuntimeException('Provider HTTP '.$response->status());
            $result = data_get($response->json(), 'choices.0.message.content');
            if (!is_string($result) || trim($result) === '') throw new RuntimeException('Răspuns gol.');
            if ($case['id'] === 'qa_map_ids') {
                $map = json_decode($result, true);
                if (($map['course_ids'] ?? null) !== [11, 12]) throw new RuntimeException('Selecția cursurilor pentru mapă nu respectă contextul.');
            }
        }
        \Formely\Evals\ResearchAssertions::check($case, $result);
        $record['passed'] = true;
        echo 'PASS '.$case['id']."\n";
    } catch (Throwable $e) {
        $record['passed'] = false;
        $record['error'] = $e->getMessage();
        echo 'FAIL '.$case['id'].': '.$e->getMessage()."\n";
    }
    file_put_contents($output.'/'.$case['id'].'-run-'.$case['run'].'.json', json_encode(['input' => $case, 'result' => $result, 'error' => $record['error'] ?? null], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    $record['provider_calls'] = $calls - $initialCalls;
    $record['total_tokens'] = $tokens - $initialTokens;
    $record['seconds'] = round(microtime(true) - $started, 2);
    $record['cumulative_calls'] = $calls;
    $records[] = $record;
    file_put_contents($output.'/results.json', json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
if (!$records) { fwrite(STDERR, "No matching cases.\n"); exit(2); }
echo json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n";
exit(count(array_filter($records, fn ($record) => !$record['passed'])) ? 1 : 0);
