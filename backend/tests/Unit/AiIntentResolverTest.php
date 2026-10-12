<?php

namespace Tests\Unit;

use App\Services\AiQuotaService;
use App\Support\AiIntentResolver;
use PHPUnit\Framework\TestCase;

class AiIntentResolverTest extends TestCase
{
    public function test_guided_creation_uses_creator_and_course_quota(): void
    {
        $intent = AiIntentResolver::resolve('course', 'guided_creation:full');
        $this->assertSame('ai_creator', $intent['feature']);
        $this->assertSame(AiQuotaService::ACTION_COURSE, $intent['action']);
        $this->assertSame('guided_creation', $intent['intent']);
    }

    public function test_builder_diff_uses_builder_feature(): void
    {
        $intent = AiIntentResolver::resolve('course', 'builder_diff');
        $this->assertSame('ai_builder', $intent['feature']);
        $this->assertSame(AiQuotaService::ACTION_COURSE, $intent['action']);
    }

    public function test_admin_tutor_uses_ai_qa_not_builder(): void
    {
        $intent = AiIntentResolver::resolve('tutor', 'admin_tutor');
        $this->assertSame('ai_qa', $intent['feature']);
        $this->assertSame(AiQuotaService::ACTION_TUTOR, $intent['action']);
    }

    public function test_student_tutor_uses_ai_tutor(): void
    {
        $intent = AiIntentResolver::resolve('tutor', 'student_tutor:answer');
        $this->assertSame('ai_tutor', $intent['feature']);
        $this->assertSame(AiQuotaService::ACTION_TUTOR, $intent['action']);
    }

    public function test_test_generation_mapping(): void
    {
        $intent = AiIntentResolver::resolve('test');
        $this->assertSame('ai_test_generation', $intent['feature']);
        $this->assertSame(AiQuotaService::ACTION_TEST, $intent['action']);
    }

    public function test_clarification_is_not_billable(): void
    {
        $this->assertFalse(AiIntentResolver::isBillableResponse('clarification'));
        $this->assertTrue(AiIntentResolver::isBillableResponse('course'));
    }
}
