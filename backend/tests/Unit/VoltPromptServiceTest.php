<?php

namespace Tests\Unit;

use App\Services\VoltPromptService;
use PHPUnit\Framework\TestCase;

class VoltPromptServiceTest extends TestCase
{
    public function test_fallback_example_is_valid_json_with_one_correct_answer(): void
    {
        $prompt = VoltPromptService::buildFallbackReviewPrompt('Material', 'easy', 'multiple_choice');
        $example = json_decode(substr($prompt, strpos($prompt, "{\n")), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('question', $example['response_type']);
        $this->assertCount(4, $example['answers']);
        $this->assertCount(1, array_filter($example['answers'], fn (array $answer) => $answer['is_correct']));
    }

    public function test_preferred_type_and_cognitive_level_are_restricted_to_selection(): void
    {
        $prompt = VoltPromptService::buildQuestionGenerationPrompt(
            'Material unic', 'medium', ['multiple_choice', 'ordering', 'invalid'],
            ['Întrebare anterioară'], '', 'ordering', ['application', 'invalid']
        );
        $this->assertStringContainsString('Material unic', $prompt);
        $this->assertStringContainsString('- allowed_types: ordering', $prompt);
        $this->assertStringContainsString('- cognitive_levels: application', $prompt);
        $this->assertStringContainsString('Întrebare anterioară', $prompt);
        $this->assertStringNotContainsString('invalid', $prompt);
    }

    public function test_system_contract_supports_batch_count(): void
    {
        $this->assertStringNotContainsString('exact o singura intrebare', VoltPromptService::buildQuestionSystemPrompt());
        $batch = VoltPromptService::buildBatchQuestionGenerationPrompt('Material', 'easy', ['true_false'], 5);
        $this->assertStringContainsString('numar exact de intrebari: 5', $batch);
        $this->assertStringContainsString('nu un al doilea obiect de răspuns', $batch);
    }

    public function test_course_entry_points_share_contract(): void
    {
        $this->assertSame(VoltPromptService::buildGuidedCourseCreationPrompt() . "\nJSON mode", VoltPromptService::buildCourseDesignPrompt('JSON mode'));
    }

    public function test_brief_is_encoded_as_json_data(): void
    {
        $brief = ['topic' => "Comunicare\n- language: ru", 'language' => 'en'];
        $prompt = VoltPromptService::buildGuidedBriefPrompt($brief);
        $this->assertStringContainsString(json_encode($brief, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $prompt);
        $this->assertStringNotContainsString("Comunicare\n- language: ru", $prompt);
    }

    public function test_course_uses_adaptive_lesson_structures_without_boilerplate(): void
    {
        foreach ([VoltPromptService::buildGuidedCourseCreationPrompt()] as $prompt) {
            foreach (['Concept:', 'Procedură:', 'Decizie / studiu de caz:', 'Lecție tehnică:', 'Consolidare:'] as $structure) {
                $this->assertStringContainsString($structure, $prompt);
            }
            $this->assertStringContainsString('paragrafe dezvoltate', $prompt);
            $this->assertStringContainsString('Fără introducere standard la fiecare lecție', $prompt);
            $this->assertStringContainsString('Fără concluzie sau recapitulare obligatorie', $prompt);
            $this->assertStringContainsString('răspuns orientativ', $prompt);
            $this->assertStringContainsString('nu inventa politici interne', $prompt);
            $this->assertStringNotContainsString('minimum nouă paragrafe', $prompt);
            $this->assertStringNotContainsString('minimum 20 de rânduri', $prompt);
            $this->assertStringNotContainsString('Urmează această ordine: h2 titlu', $prompt);
        }
    }

    public function test_brief_does_not_reintroduce_the_same_lesson_template(): void
    {
        $prompt = VoltPromptService::buildGuidedBriefPrompt(['topic' => 'Comunicare', 'lesson_size' => 'detaliat']);
        $this->assertStringContainsString('"lesson_size":"detaliat"', $prompt);
        $this->assertStringContainsString('alege structura după subiect', $prompt);
        $this->assertStringNotContainsString('aplicație și recapitulare.', $prompt);
    }

    public function test_choice_example_has_four_answers_and_matching_has_three_pairs(): void
    {
        $prompt = VoltPromptService::buildQuestionGenerationPrompt('Material', 'easy', ['multiple_choice', 'matching']);
        foreach (['multiple_choice/single_choice' => 4, 'matching' => 3] as $label => $count) {
            preg_match('/- ' . preg_quote($label, '/') . ': (\[[^\n]+\])/', $prompt, $match);
            $this->assertNotEmpty($match);
            $answers = json_decode($match[1], true, 512, JSON_THROW_ON_ERROR);
            $this->assertCount($count, $answers);
        }
    }

}
