<?php

namespace App\Support;

use App\Services\AiQuotaService;

/**
 * Single source of truth: request type+mode → plan feature + quota action.
 */
final class AiIntentResolver
{
    /**
     * @return array{feature: string, action: string|null, intent: string}
     */
    public static function resolve(string $type, string $mode = ''): array
    {
        $type = in_array($type, ['course', 'tutor', 'test'], true) ? $type : 'course';
        $mode = (string) $mode;

        if ($type === 'test') {
            return [
                'intent' => 'test_generation',
                'feature' => 'ai_test_generation',
                'action' => AiQuotaService::ACTION_TEST,
            ];
        }

        if ($type === 'tutor' || str_starts_with($mode, 'admin_tutor') || str_starts_with($mode, 'student_tutor')) {
            $isLearnerTutor = str_starts_with($mode, 'student_tutor');

            return [
                'intent' => $isLearnerTutor ? 'student_tutor' : 'admin_tutor',
                'feature' => $isLearnerTutor ? 'ai_tutor' : 'ai_qa',
                'action' => AiQuotaService::ACTION_TUTOR,
            ];
        }

        if (str_contains($mode, 'builder_diff')) {
            return [
                'intent' => 'builder_diff',
                'feature' => 'ai_builder',
                'action' => AiQuotaService::ACTION_COURSE,
            ];
        }

        // guided_creation, full course create, default course generation
        return [
            'intent' => str_contains($mode, 'guided_creation') ? 'guided_creation' : 'course_creation',
            'feature' => 'ai_creator',
            'action' => AiQuotaService::ACTION_COURSE,
        ];
    }

    /**
     * @return array{feature: string, action: string, intent: string}
     */
    public static function forStudyTool(): array
    {
        return [
            'intent' => 'study_tool',
            'feature' => 'ai_tutor',
            'action' => AiQuotaService::ACTION_TUTOR,
        ];
    }

    /**
     * @return array{feature: string, action: null, intent: string}
     */
    public static function forExtractDocument(): array
    {
        return [
            'intent' => 'extract_document',
            'feature' => 'ai_creator',
            'action' => null,
        ];
    }

    public static function isBillableResponse(?string $responseType): bool
    {
        $responseType = strtolower(trim((string) $responseType));

        return in_array($responseType, ['course', 'test', 'tutor', 'plan', 'builder_diff', 'answer'], true);
    }
}
