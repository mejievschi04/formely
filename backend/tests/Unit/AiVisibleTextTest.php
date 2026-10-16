<?php

namespace Tests\Unit;

use App\Http\Controllers\AIController;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\VoltQuestionGenerationService;
use App\Support\VisibleText;
use Tests\TestCase;

class AiVisibleTextTest extends TestCase
{
    public function test_html_boundaries_preserve_words_and_escaped_code(): void
    {
        $this->assertSame('Un cuvânt alt rând <button>Salvează</button>', VisibleText::fromHtml(
            '<p>Un&nbsp;<strong>cu</strong>vânt</p><div>alt<br>rând</div><code>&lt;button&gt;Salvează&lt;/button&gt;</code>'
        ));
        $this->assertSame('&lt;button&gt;', VisibleText::fromHtml('&amp;lt;button&amp;gt;'));
    }

    public function test_study_tools_keep_paragraph_words_separate(): void
    {
        $method = new \ReflectionMethod(AIController::class, 'studyToolPlainText');
        $this->assertSame('Primul paragraf Al doilea rând', $method->invoke(
            app(AIController::class), '<p>Primul paragraf</p><p>Al&nbsp;doilea<br>rând</p>'
        ));
    }

    public function test_question_material_preserves_escaped_html_examples(): void
    {
        $lesson = new Lesson(['title' => 'HTML', 'content' => '<p>Butonul &lt;button&gt;Salvează&lt;/button&gt; confirmă modificările.</p>']);
        $lesson->setRelation('contentBlocks', collect());
        $course = new Course(['title' => 'HTML', 'description' => 'Elemente HTML']);
        $course->setRelation('modules', collect());
        $course->setRelation('lessons', collect([$lesson]));

        $material = app(VoltQuestionGenerationService::class)->extractCourseContent($course);
        $this->assertStringContainsString('<button>Salvează</button>', $material);
    }
}
