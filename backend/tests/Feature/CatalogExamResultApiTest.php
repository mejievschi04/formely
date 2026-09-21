<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogExamResultApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_exam_results_lists_only_standalone_exam_attempts(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);

        $catalogExam = Exam::create([
            'title' => 'Examen catalog',
            'status' => 'published',
            'created_by' => $owner->id,
            'course_id' => null,
            'passing_score' => 70,
        ]);

        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);

        $courseExam = Exam::create([
            'title' => 'Examen in curs',
            'status' => 'published',
            'created_by' => $owner->id,
            'course_id' => $course->id,
            'passing_score' => 70,
        ]);

        $catalogResult = ExamResult::create([
            'exam_id' => $catalogExam->id,
            'user_id' => $student->id,
            'score' => 80,
            'total_points' => 100,
            'percentage' => 80,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
        ]);

        ExamResult::create([
            'exam_id' => $courseExam->id,
            'user_id' => $student->id,
            'score' => 90,
            'total_points' => 100,
            'percentage' => 90,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
        ]);

        TestResult::create([
            'test_id' => Test::factory()->published()->create(['created_by' => $owner->id])->id,
            'user_id' => $student->id,
            'score' => 50,
            'max_score' => 100,
            'percentage' => 50,
            'passed' => false,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
            'status' => 'completed',
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson('/api/catalog-exam-results');

        $response->assertOk();
        $results = collect($response->json());
        $this->assertCount(1, $results);
        $this->assertSame('exam', $results->first()['type']);
        $this->assertSame($catalogResult->id, $results->first()['id']);
        $this->assertSame($catalogExam->id, $results->first()['exam_id']);
    }

    public function test_student_cannot_view_other_users_catalog_exam_result(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $other = User::factory()->create(['role' => 'student']);
        $owner = User::factory()->create(['role' => 'teacher']);

        $exam = Exam::create([
            'title' => 'Examen catalog',
            'status' => 'published',
            'created_by' => $owner->id,
            'course_id' => null,
            'passing_score' => 70,
        ]);

        $result = ExamResult::create([
            'exam_id' => $exam->id,
            'user_id' => $other->id,
            'score' => 70,
            'total_points' => 100,
            'percentage' => 70,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => [],
            'completed_at' => now(),
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/catalog-exam-results/{$result->id}")
            ->assertNotFound();
    }
}
