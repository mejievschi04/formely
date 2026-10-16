<?php

namespace Tests\Unit;

use App\Http\Controllers\AIController;
use Tests\TestCase;
use ReflectionClass;

class BuilderDiffValidationTest extends TestCase
{
    private function validate(array $plan): array
    {
        $reflection = new ReflectionClass(AIController::class);
        return $reflection->getMethod('validateBuilderDiffPlanData')->invoke($reflection->newInstanceWithoutConstructor(), $plan);
    }

    public function test_new_module_with_complete_nested_lessons_is_valid(): void
    {
        $content = '<h2>Obiectiv</h2><p>Explicație concretă.</p><p>Exemplu rezolvat.</p><p>Aplicație verificabilă.</p><p>Recapitulare.</p>';
        $result = $this->validate(['operations' => [['op' => 'create_module', 'title' => 'JavaScript', 'lessons' => [['title' => 'Introducere', 'content' => $content]]]]]);
        $this->assertTrue($result['valid']);
    }

    public function test_missing_op_and_short_content_are_rejected(): void
    {
        $this->assertFalse($this->validate(['operations' => [['create_lesson' => ['title' => 'Introducere']]]])['valid']);
        $this->assertFalse($this->validate(['operations' => [['op' => 'create_lesson', 'title' => 'Introducere', 'content' => '<p>Rezumat.</p>']]])['valid']);
    }
}
