<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\User;
use App\Services\AiCoursePlanService;
use App\Services\CourseBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AiCoursePlanTest extends TestCase
{
    use RefreshDatabase;

    private Course $course;
    private Module $module;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        $actor = User::factory()->create(['role' => 'admin']);
        $this->actingAs($actor, 'sanctum');
        $this->course = Course::factory()->create(['teacher_id' => $actor->id, 'status' => 'draft']);
        $this->module = Module::create(['course_id' => $this->course->id, 'title' => 'Existent', 'order' => 0, 'status' => 'draft']);
    }

    private function content(): string
    {
        return '<p>'.str_repeat('Explicația descrie situația și justifică alegerea prin efectul asupra rezultatului. ', 12).'</p>';
    }

    private function apply(array $operations, array $updates = [], ?string $revision = null)
    {
        return $this->postJson('/api/admin/courses/'.$this->course->id.'/builder/ai-plan', ['plan' => [
            'base_revision' => $revision ?? app(AiCoursePlanService::class)->revision($this->course->id),
            'course_updates' => $updates, 'operations' => $operations,
        ]]);
    }

    public function test_dense_prose_and_nested_lessons_are_saved_in_one_plan(): void
    {
        $this->apply([
            ['op' => 'create_module', 'title' => 'Nou', 'lessons' => [['title' => 'Lecție', 'content' => $this->content()]]],
            ['op' => 'createLesson', 'module_id' => null, 'title' => 'Directă', 'body' => $this->content()],
        ], ['title' => 'Titlu nou'])->assertOk()->assertJsonPath('appliedSteps', 4);
        $this->assertSame('Titlu nou', $this->course->fresh()->title);
        $this->assertDatabaseCount('lessons', 2);
        $this->assertDatabaseCount('modules', 2);
        $this->assertDatabaseHas('lessons', ['title' => 'Directă', 'module_id' => null]);
    }

    public function test_a_precise_edit_can_preserve_a_short_lesson_without_artificial_padding(): void
    {
        $lesson = Lesson::create(['course_id' => $this->course->id, 'module_id' => $this->module->id, 'title' => 'Notificare', 'content' => '<p>Notifică managerul în două ore.</p>', 'order' => 0]);
        $content = '<p>Notifică managerul în două ore. Exemplu: dacă incidentul apare la ora 10, notifică până la ora 12.</p>';
        $this->apply([['op' => 'update_lesson', 'lesson_id' => $lesson->id, 'content' => $content]])->assertOk();
        $this->assertSame($content, $lesson->fresh()->content);
        $this->apply([['op' => 'update_lesson', 'lesson_id' => $lesson->id, 'content' => '<script>alert(1)</script>']])->assertUnprocessable();
        $this->assertSame($content, $lesson->fresh()->content);
    }

    public function test_literal_escaped_html_closing_tags_are_normalized(): void
    {
        $lesson = Lesson::create(['course_id' => $this->course->id, 'title' => 'Notificare', 'content' => '<p>Original.</p>', 'order' => 0]);
        $this->apply([['op' => 'update_lesson', 'lesson_id' => $lesson->id, 'content' => '<p>Notifică managerul în două ore.<\/p>']])->assertOk();
        $this->assertSame('<p>Notifică managerul în două ore.</p>', $lesson->fresh()->content);
    }

    public function test_content_block_changes_invalidate_a_proposal(): void
    {
        $lesson = Lesson::create(['course_id' => $this->course->id, 'module_id' => $this->module->id, 'title' => 'Lecție', 'order' => 0]);
        $block = \App\Models\ContentBlock::create(['lesson_id' => $lesson->id, 'type' => 'text', 'source' => '', 'payload' => ['html' => '<p>Versiunea inițială.</p>'], 'order' => 0]);
        $revision = app(AiCoursePlanService::class)->revision($this->course->id);
        $block->update(['payload' => ['html' => '<p>Editat după generare.</p>']]);
        $this->apply([['op' => 'update_lesson', 'lesson_id' => $lesson->id, 'title' => 'Nu se aplică']], [], $revision)->assertStatus(409);
        $this->assertSame('Lecție', $lesson->fresh()->title);
    }

    public function test_late_failure_rolls_back_metadata_and_every_prior_creation(): void
    {
        $title = $this->course->title;
        $other = Course::factory()->create();
        $foreignModule = Module::create(['course_id' => $other->id, 'title' => 'Alt curs', 'order' => 0]);
        $this->apply([
            ['op' => 'create_module', 'title' => 'Nu rămâne', 'lessons' => [['title' => 'Nu rămâne', 'content' => $this->content()]]],
            ['op' => 'update_module', 'module_id' => $foreignModule->id, 'title' => 'Interzis'],
        ], ['title' => 'Nu rămâne'])->assertNotFound();
        $this->assertSame($title, $this->course->fresh()->title);
        $this->assertDatabaseCount('lessons', 0);
        $this->assertDatabaseMissing('modules', ['title' => 'Nu rămâne']);
        $this->assertSame('Alt curs', $foreignModule->fresh()->title);
    }

    public function test_stale_or_repeated_plan_cannot_overwrite_or_duplicate_changes(): void
    {
        $revision = app(AiCoursePlanService::class)->revision($this->course->id);
        $operations = [['op' => 'create_lesson', 'module_id' => $this->module->id, 'title' => 'Unică', 'content' => $this->content()]];
        $this->apply($operations, [], $revision)->assertOk();
        $this->apply($operations, [], $revision)->assertConflict();
        $this->assertDatabaseCount('lessons', 1);
    }

    public function test_invalid_nested_content_is_rejected_before_any_write(): void
    {
        $this->apply([['op' => 'create_module', 'title' => 'Nu rămâne', 'lessons' => [['title' => 'Scurtă', 'content' => '<p>Rezumat.</p>']]]])
            ->assertUnprocessable();
        $this->assertDatabaseCount('modules', 1);
        $this->assertDatabaseCount('lessons', 0);
    }

    public function test_unknown_operations_and_empty_updates_are_not_reported_as_success(): void
    {
        $this->apply([['op' => 'do_something']])->assertUnprocessable();
        $this->apply([['op' => 'update_lesson', 'lesson_id' => 1]])->assertUnprocessable();
        $this->apply([], [])->assertUnprocessable();
    }

    public function test_move_and_reorder_operations_include_root_lessons(): void
    {
        $first = app(CourseBuilderService::class)->createLesson($this->module, ['title' => 'Prima', 'content' => $this->content()]);
        $second = app(CourseBuilderService::class)->createLesson($this->module, ['title' => 'A doua', 'content' => $this->content()]);
        $this->apply([
            ['op' => 'reorder_lessons', 'module_id' => $this->module->id, 'lesson_ids' => [$second->id, $first->id]],
            ['op' => 'move_lesson', 'lesson_id' => $first->id, 'to_module_id' => null, 'to_index' => 0],
        ])->assertOk();
        $this->assertNull($first->fresh()->module_id);
        $this->assertSame(0, $second->fresh()->order);
    }

    public function test_instructor_cannot_apply_to_another_instructors_course(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'instructor', 'company_id' => $this->course->company_id]), 'sanctum');
        $this->apply([], ['title' => 'Interzis'])->assertForbidden();
    }

    public function test_plan_cannot_cross_companies_or_publish_without_course_validation(): void
    {
        $this->apply([], ['status' => 'published'])->assertUnprocessable();
        $company = Company::create(['name' => 'Altă academie', 'slug' => 'ai-other', 'plan' => 'business', 'status' => 'active']);
        $this->actingAs(User::factory()->create(['role' => 'admin', 'company_id' => $company->id]), 'sanctum');
        $this->apply([], ['title' => 'Interzis'])->assertNotFound();
    }
}
