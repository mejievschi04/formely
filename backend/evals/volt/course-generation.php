<?php

// Synthetic live-provider evaluation. Does not save courses or charge tenant credits.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$options = getopt('', ['output:', 'size:', 'lessons:', 'baseline', 'language:', 'source']);
if ((isset($options['size']) && !in_array($options['size'], ['scurt', 'mediu', 'detaliat'], true))
    || (isset($options['language']) && !in_array($options['language'], ['ro', 'en', 'ru'], true))
    || (isset($options['lessons']) && !in_array((string) $options['lessons'], ['1', '2', '3', '4'], true))) {
    fwrite(STDERR, "Use --size=scurt|mediu|detaliat, --language=ro|en|ru, --lessons=1..4.\n");
    exit(2);
}
$output = $options['output'] ?? sys_get_temp_dir().'/formely-course-eval';
if (!is_dir($output)) mkdir($output, 0700, true);
$calls = 0;
$tokens = 0;
Illuminate\Support\Facades\Event::listen(Illuminate\Http\Client\Events\ResponseReceived::class, function ($event) use ($output, &$calls, &$tokens) {
    $body = $event->response->json();
    $tokens += (int) ($body['usage']['total_tokens'] ?? 0);
    file_put_contents($output.'/provider-'.(++$calls).'.json', json_encode([
        'status' => $event->response->status(), 'body' => $body,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
});
$generator = app(App\Services\StagedAiCourseGenerator::class);
$request = new ReflectionMethod($generator, 'request');
$outlineValidator = new ReflectionMethod($generator, 'validateOutline');
$cases = [
    'scurt' => ['topic' => 'Feedback constructiv în echipă', 'language' => 'ro', 'style' => 'practic'],
    'mediu' => ['topic' => 'JavaScript DOM: selectarea și modificarea elementelor', 'language' => 'ro', 'style' => 'practic'],
    'detaliat' => ['topic' => 'Customer support: diagnosing a delayed delivery', 'language' => 'en', 'style' => 'mixt'],
];
$results = [];
foreach ($cases as $size => $case) {
    if (isset($options['size']) && $options['size'] !== $size) continue;
    if (isset($options['language'])) $case['language'] = $options['language'];
    if (isset($options['source'])) $case['topic'] = 'Procesarea cererilor de retur în magazinul fictiv Demo';
    $brief = $case + ['target_audience' => 'Angajați noi / începători', 'level' => 'incepator', 'lesson_size' => $size,
        'modules_count' => 2, 'lessons_per_module' => 2, 'evaluation' => 'none'];
    $input = ['prompt' => 'Creează cursul conform formularului.', 'guided_brief' => $brief];
    if (isset($options['source'])) {
        $input['attachments'] = [['name' => 'procedura-demo.txt', 'text' => 'Procedură sintetică pentru magazinul fictiv Demo: Cererile de retur se înregistrează în registrul R1. Operatorul cere numărul comenzii și motivul returului. Magazinul acceptă cererile depuse în 14 zile de la livrare. Operatorul verifică data livrării înainte de a decide. Dacă lipsesc datele sau există o excepție, operatorul transmite cazul coordonatorului și nu promite rambursarea. Confirmarea primirii cererii nu reprezintă aprobarea returului. Nu sunt precizate termene de rambursare sau costuri de transport.']];
    }
    file_put_contents($output.'/'.$size.'-input.json', json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    $provider = config('ai.provider');
    file_put_contents($output.'/'.$size.'-metadata.json', json_encode([
        'provider' => $provider, 'model' => config("ai.$provider.creator_model") ?: config("ai.$provider.model"),
        'outline_prompt_sha256' => hash('sha256', App\Services\VoltPromptService::buildStagedCourseOutlinePrompt()),
        'lesson_prompt_sha256' => hash('sha256', App\Services\VoltPromptService::buildSingleCourseLessonPrompt($size, $brief['language'])),
        'started_at' => gmdate(DATE_ATOM),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    $started = microtime(true);
    echo "START {$size}\n";
    try {
        $outline = $request->invoke($generator, App\Services\VoltPromptService::buildStagedCourseOutlinePrompt(), $input);
        $outlineValidator->invoke($generator, $outline, $brief);
        file_put_contents($output.'/'.$size.'-outline.json', json_encode($outline, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $previous = [];
        $limit = (int) ($options['lessons'] ?? 4);
        foreach ($outline['modules'] as $mi => $module) {
            foreach ($module['lessons'] as $li => $lesson) {
                if (count($previous) >= $limit) break 2;
                $data = $input + ['outline' => $outline, 'selected_lesson' => $lesson, 'module_index' => $mi, 'lesson_index' => $li];
                if (isset($options['baseline'])) {
                    $raw = $request->invoke($generator, App\Services\VoltPromptService::buildSingleCourseLessonPrompt($size, $brief['language']), $data);
                    file_put_contents($output."/{$size}-{$mi}-{$li}-raw.json", json_encode($raw, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                    $content = app(App\Services\AiLessonQuality::class)->validate($raw, $size, $previous);
                } else {
                    $content = $generator->generateLesson($data, $previous);
                }
                file_put_contents($output."/{$size}-{$mi}-{$li}.html", $content);
                $words = preg_match_all('/[\p{L}\p{N}]+/u', App\Support\VisibleText::fromHtml(preg_replace('/<pre\b[^>]*>.*?<\/pre>/is', '', $content)));
                echo "PASS {$size} {$mi}.{$li} words={$words}\n";
                $previous[] = ['title' => $lesson['title'], 'content' => $content];
            }
        }
        $results[] = ['size' => $size, 'passed' => true, 'lessons' => count($previous), 'seconds' => round(microtime(true) - $started, 2), 'cumulative_calls' => $calls, 'cumulative_tokens' => $tokens];
    } catch (Throwable $e) {
        $results[] = ['size' => $size, 'passed' => false, 'error' => $e->getMessage(), 'seconds' => round(microtime(true) - $started, 2)];
        echo "FAIL {$size}: ".$e->getMessage()."\n";
    }
    file_put_contents($output.'/results.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)."\n";
exit(count(array_filter($results, fn ($r) => !$r['passed'])) ? 1 : 0);
