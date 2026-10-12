<?php

namespace Tests\Feature;

use App\Http\Controllers\AIController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use ReflectionClass;
use Tests\TestCase;

class AiGenerationFormTest extends TestCase
{
    private function validateForm(string $kind, array $brief): void
    {
        $ref = new ReflectionClass(AIController::class);
        $ref->getMethod('validateGenerationForm')->invoke($ref->newInstanceWithoutConstructor(), Request::create('/api/admin/ai/generate-course', 'POST', [$kind === 'course' ? 'guided_brief' : 'test_brief' => $brief]), $kind);
    }

    public function test_every_course_field_is_required_before_ai_work(): void
    {
        Http::fake();
        $brief = ['topic' => 'JavaScript', 'target_audience' => 'Elevi', 'level' => 'incepator', 'style' => 'practic', 'lesson_size' => 'scurt', 'language' => 'ro', 'modules_count' => 2, 'lessons_per_module' => 2, 'evaluation' => 'none'];
        $this->validateForm('course', $brief);
        foreach (array_keys($brief) as $field) {
            $incomplete = $brief;
            unset($incomplete[$field]);
            try {
                $this->validateForm('course', $incomplete);
                $this->fail('Accepted missing field: ' . $field);
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('guided_brief.' . $field, $e->errors());
            }
        }
        Http::assertNothingSent();
    }

    public function test_every_test_field_is_required_and_empty_material_is_rejected(): void
    {
        Http::fake();
        $brief = ['topic' => 'JavaScript', 'language' => 'ro', 'question_count' => 10, 'difficulty' => 'easy', 'question_type' => 'multiple_choice', 'material' => 'O variabilă păstrează o valoare care poate fi folosită în program.'];
        $this->validateForm('test', $brief);
        foreach (array_keys($brief) as $field) {
            $incomplete = $brief;
            unset($incomplete[$field]);
            try {
                $this->validateForm('test', $incomplete);
                $this->fail('Accepted missing field: ' . $field);
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('test_brief.' . $field, $e->errors());
            }
        }
        Http::assertNothingSent();
    }
}
