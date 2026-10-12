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

    public function test_course_source_is_loaded_on_server_and_replaces_client_material(): void
    {
        Http::fake();
        $builder = $this->createMock(\App\Services\CourseBuilderService::class);
        $builder->expects($this->once())->method('getBuilderStructure')->with(12)->willReturn([
            'lessons' => collect([(object) ['title' => 'Variabile', 'content' => '<p>Const declară o variabilă care nu poate fi reasignată după inițializare.</p>']]),
        ]);
        $this->app->instance(\App\Services\CourseBuilderService::class, $builder);
        $request = Request::create('/api/admin/ai/generate-test', 'POST', ['courseId' => 12, 'test_brief' => [
            'topic' => 'Test final', 'language' => 'ro', 'question_count' => 3, 'difficulty' => 'easy', 'question_type' => 'multiple_choice', 'source' => 'course', 'material' => 'Text fals trimis de client',
        ]]);
        $method = (new ReflectionClass(AIController::class))->getMethod('validateGenerationForm');
        $method->invoke(app(AIController::class), $request, 'test');
        $this->assertStringContainsString('Const declară', $request->input('test_brief.material'));
        $this->assertStringNotContainsString('Text fals', $request->input('test_brief.material'));
        Http::assertNothingSent();
    }

}
