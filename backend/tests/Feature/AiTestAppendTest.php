<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use App\Services\TestBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiTestAppendTest extends TestCase
{
    use RefreshDatabase;

    public function test_append_keeps_existing_question_ids_and_orders_new_questions_after_them(): void
    {
        $test = Test::factory()->create(['created_by' => User::factory()->create()->id, 'status' => 'draft', 'question_source' => 'direct']);
        $existing = collect([0, 1])->map(fn ($order) => Question::create(['test_id' => $test->id, 'type' => 'multiple_choice', 'content' => 'Existentă '.$order, 'answers' => [['text' => 'A', 'is_correct' => true], ['text' => 'B', 'is_correct' => false]], 'order' => $order, 'points' => 1]));
        $new = array_map(fn ($i) => ['type' => 'multiple_choice', 'content' => 'Nouă '.$i, 'answers' => [['text' => 'A', 'is_correct' => true], ['text' => 'B', 'is_correct' => false]], 'order' => $i, 'points' => 1], [0, 1, 2]);
        app(TestBuilderService::class)->updateTest($test, ['questions_mode' => 'append', 'questions' => $new]);
        $reloaded = Test::findOrFail($test->id)->questions()->orderBy('order')->get();
        $this->assertCount(5, $reloaded);
        $this->assertSame($existing->pluck('id')->all(), $reloaded->take(2)->pluck('id')->all());
        $this->assertSame([0, 1, 2, 3, 4], $reloaded->pluck('order')->all());
        $this->assertSame(['Nouă 0', 'Nouă 1', 'Nouă 2'], $reloaded->slice(2)->pluck('content')->all());
    }

    public function test_failed_replacement_rolls_back_title_and_existing_questions(): void
    {
        $test = Test::factory()->create(['created_by' => User::factory()->create()->id, 'status' => 'draft', 'question_source' => 'direct']);
        $old = Question::create(['test_id' => $test->id, 'type' => 'multiple_choice', 'content' => 'Păstrată', 'answers' => [], 'points' => 1, 'order' => 0]);
        try {
            app(TestBuilderService::class)->updateTest($test, ['title' => 'Titlu schimbat', 'questions' => [['content' => null, 'answers' => []]]]);
            $this->fail('Invalid insert should fail');
        } catch (\Illuminate\Database\QueryException $e) {
            $this->assertSame($test->title, $test->fresh()->title);
            $this->assertDatabaseHas('questions', ['id' => $old->id, 'content' => 'Păstrată']);
        }
    }
}
