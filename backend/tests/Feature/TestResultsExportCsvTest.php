<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Team;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TestResultsExportCsvTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_export_test_results_csv_filtered_by_course_and_team(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $owner = User::factory()->create(['role' => 'teacher']);
        $studentA = User::factory()->create(['role' => 'student', 'name' => 'Ana Team']);
        $studentB = User::factory()->create(['role' => 'student', 'name' => 'Bogdan Other']);

        $course = Course::factory()->published()->create(['teacher_id' => $owner->id, 'title' => 'Sales 101']);
        $test = Test::factory()->published()->create([
            'title' => 'Quiz final',
            'created_by' => $owner->id,
        ]);

        $team = Team::create([
            'name' => 'Sales Team',
            'owner_id' => $owner->id,
        ]);

        DB::table('team_user')->insert([
            ['team_id' => $team->id, 'user_id' => $studentA->id, 'created_at' => now(), 'updated_at' => now()],
        ]);

        TestResult::create([
            'test_id' => $test->id,
            'course_id' => $course->id,
            'user_id' => $studentA->id,
            'attempt_number' => 1,
            'score' => 80,
            'max_score' => 100,
            'percentage' => 80,
            'passed' => true,
            'answers' => [],
            'completed_at' => now()->subDay(),
            'status' => 'completed',
        ]);

        TestResult::create([
            'test_id' => $test->id,
            'course_id' => $course->id,
            'user_id' => $studentB->id,
            'attempt_number' => 1,
            'score' => 40,
            'max_score' => 100,
            'percentage' => 40,
            'passed' => false,
            'answers' => [],
            'completed_at' => now()->subDay(),
            'status' => 'completed',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->get(
            "/api/admin/test-results/export?test_id={$test->id}&course_id={$course->id}&team_id={$team->id}"
        );

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();
        $this->assertStringContainsString('Ana Team', $content);
        $this->assertStringContainsString('Quiz final', $content);
        $this->assertStringContainsString('Sales 101', $content);
        $this->assertStringNotContainsString('Bogdan Other', $content);
    }

    public function test_instructor_cannot_export_results_for_other_instructors_test(): void
    {
        $owner = User::factory()->create(['role' => 'teacher']);
        $other = User::factory()->create(['role' => 'teacher']);
        $test = Test::factory()->published()->create(['created_by' => $owner->id]);

        $this->actingAs($other, 'sanctum')
            ->get("/api/admin/test-results/export?test_id={$test->id}")
            ->assertForbidden();
    }
}
