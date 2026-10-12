<?php

// Export the current production prompt builders without booting Laravel or calling a provider.
require dirname(__DIR__, 2) . '/vendor/autoload.php';

use App\Services\VoltPromptService;

$cases = json_decode(file_get_contents(__DIR__ . '/cases.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($cases as $case) {
    $input = $case['input'];
    $system = match ($case['flow']) {
        'course' => VoltPromptService::buildGuidedCourseCreationPrompt()
            . (isset($input['brief']) ? VoltPromptService::buildGuidedBriefPrompt($input['brief']) : ''),
        'builder' => VoltPromptService::buildBuilderDiffPrompt(),
        'qa' => VoltPromptService::buildAdminTutorPrompt(),
        'test' => VoltPromptService::buildTestPrompt(''),
        'batch' => VoltPromptService::buildQuestionSystemPrompt(),
    };
    $user = $case['flow'] === 'batch'
        ? VoltPromptService::buildBatchQuestionGenerationPrompt(
            $input['material'], $input['difficulty'], $input['types'], $input['count'], [], $input['cognitive_levels'] ?? []
        )
        : $input['request'];
    if (isset($input['context'])) {
        $user .= "\nDate de referință JSON:\n" . json_encode($input['context'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
    echo json_encode([
        'id' => $case['id'],
        'flow' => $case['flow'],
        'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
        'checks' => $case['checks'],
        'prompt_sha256' => hash('sha256', $system . "\n" . $user),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
}
