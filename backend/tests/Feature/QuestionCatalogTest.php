<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseMap;
use App\Models\CourseTest;
use App\Models\Question;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuestionCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_groups_tests_by_map_and_lists_questions(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $inMap = Course::factory()->published()->create(['title' => 'Curs din mapă']);
        $outside = Course::factory()->published()->create(['title' => 'Curs liber']);
        $map = CourseMap::create([
            'name' => 'Mapa catalog',
            'description' => null,
            'visibility' => 'public',
            'order' => 0,
            'created_by' => $admin->id,
        ]);
        $map->courses()->attach([$inMap->id => ['order' => 0]]);

        $mapTest = Test::factory()->create([
            'title' => 'Test din mapă',
            'created_by' => $admin->id,
            'question_source' => 'direct',
        ]);
        $freeTest = Test::factory()->create([
            'title' => 'Test liber',
            'created_by' => $admin->id,
            'question_source' => 'direct',
        ]);
        CourseTest::create([
            'course_id' => $inMap->id,
            'test_id' => $mapTest->id,
            'scope' => 'course',
            'required' => false,
            'order' => 0,
        ]);
        CourseTest::create([
            'course_id' => $outside->id,
            'test_id' => $freeTest->id,
            'scope' => 'course',
            'required' => false,
            'order' => 0,
        ]);
        Question::create([
            'test_id' => $mapTest->id,
            'type' => 'multiple_choice',
            'content' => 'Întrebare din mapă?',
            'answers' => [['text' => 'Da', 'is_correct' => true]],
            'points' => 1,
            'order' => 0,
        ]);

        $maps = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/question-catalog/maps')
            ->assertOk()
            ->json('data');

        $mapRow = collect($maps)->firstWhere('name', 'Mapa catalog');
        $this->assertNotNull($mapRow);
        $this->assertSame(1, (int) $mapRow['tests_count']);
        $this->assertSame(1, (int) $mapRow['questions_count']);

        $tests = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/question-catalog/maps/{$map->id}/tests")
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $tests);
        $this->assertSame('Test din mapă', $tests[0]['title']);
        $this->assertSame(1, (int) $tests[0]['questions_count']);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/admin/tests/{$mapTest->id}/questions")
            ->assertOk()
            ->assertJsonFragment(['content' => 'Întrebare din mapă?']);
    }
}
