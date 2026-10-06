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

class PendingReviewCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_count_endpoints_match_pending_review_lists_for_each_role(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $owner = User::factory()->create(['role' => 'instructor']);
        $otherInstructor = User::factory()->create(['role' => 'instructor']);
        $student = User::factory()->create(['role' => 'student']);

        $course = Course::factory()->published()->create(['teacher_id' => $owner->id]);
        $test = Test::factory()->published()->create(['created_by' => $owner->id]);
        $exam = Exam::withoutEvents(fn () => Exam::create([
            'course_id' => $course->id,
            'title' => 'Examen cu eseu',
            'status' => 'published',
            'max_score' => 100,
            'passing_score' => 70,
            'max_attempts' => 3,
            'created_by' => $owner->id,
        ]));

        $testResult = fn (array $attrs) => TestResult::create(array_merge([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 0,
            'max_score' => 10,
            'percentage' => 0,
            'passed' => false,
            'answers' => [],
            'completed_at' => now(),
        ], $attrs));
        $testResult(['attempt_number' => 1, 'status' => 'pending_review']);
        $testResult(['attempt_number' => 2, 'needs_manual_review' => true]);
        $testResult(['attempt_number' => 3, 'needs_manual_review' => true, 'reviewed_at' => now()]);

        $examResult = fn (array $attrs) => ExamResult::create(array_merge([
            'exam_id' => $exam->id,
            'user_id' => $student->id,
            'score' => 0,
            'total_points' => 100,
            'percentage' => 0,
            'passed' => false,
            'answers' => [],
            'completed_at' => now(),
        ], $attrs));
        $examResult(['attempt_number' => 1, 'needs_manual_review' => true]);
        $examResult(['attempt_number' => 2, 'needs_manual_review' => true, 'reviewed_at' => now()]);

        foreach ([[$admin, 2, 1], [$owner, 2, 1], [$otherInstructor, 0, 0]] as [$user, $tests, $exams]) {
            $this->actingAs($user, 'sanctum');

            $this->assertCount($tests, $this->getJson('/api/admin/tests/pending-reviews')->assertOk()->json());
            $this->getJson('/api/admin/tests/pending-reviews/count')->assertOk()->assertExactJson(['count' => $tests]);

            $this->assertCount($exams, $this->getJson('/api/admin/exams/pending-reviews')->assertOk()->json());
            $this->getJson('/api/admin/exams/pending-reviews/count')->assertOk()->assertExactJson(['count' => $exams]);
        }
    }
}
