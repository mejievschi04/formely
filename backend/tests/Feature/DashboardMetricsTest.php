<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\ActivityLog;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DashboardMetricsTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_dashboard_counts_results_from_both_result_tables(): void
    {
        [$student, $course, $test, $exam] = $this->seedResultsScenario();

        TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 80,
            'max_score' => 100,
            'percentage' => 80,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'started_at' => now()->subMinutes(10),
            'completed_at' => now()->subMinutes(5),
        ]);

        ExamResult::create([
            'exam_id' => $exam->id,
            'user_id' => $student->id,
            'score' => 60,
            'total_points' => 100,
            'percentage' => 60,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'completed_at' => now()->subMinutes(3),
        ]);

        $response = $this->actingAs($student, 'sanctum')->getJson('/api/student/dashboard');

        $response->assertOk()
            ->assertJsonPath('test_completion_percentage.value', 70)
            ->assertJsonPath('stats.total_exams_passed', 2);
    }

    public function test_admin_dashboard_recent_activities_includes_test_and_exam_results(): void
    {
        [$student, $course, $test, $exam, $admin] = $this->seedResultsScenario(true);

        TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 80,
            'max_score' => 100,
            'percentage' => 80,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'started_at' => now()->subMinutes(10),
            'completed_at' => now()->subMinutes(5),
        ]);

        ExamResult::create([
            'exam_id' => $exam->id,
            'user_id' => $student->id,
            'score' => 60,
            'total_points' => 100,
            'percentage' => 60,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'completed_at' => now()->subMinutes(3),
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard');

        $response->assertOk();

        $descriptions = collect($response->json('recent_activities'))->pluck('description');
        $this->assertTrue($descriptions->contains(fn ($description) => str_contains($description, $test->title)));
        $this->assertTrue($descriptions->contains(fn ($description) => str_contains($description, $exam->title)));
    }

    public function test_admin_dashboard_chart_metrics_are_backed_by_real_activity(): void
    {
        [$student, $course, $test, $exam, $admin] = $this->seedResultsScenario(true);

        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecție dashboard',
            'content' => 'Conținut pentru metrice dashboard',
            'duration_minutes' => 30,
            'order' => 1,
        ]);

        DB::table('lesson_progress')->insert([
            'lesson_id' => $lesson->id,
            'user_id' => $student->id,
            'completed' => false,
            'time_spent_seconds' => 7200,
            'progress_percentage' => 50,
            'started_at' => now()->subHours(2),
            'completed_at' => null,
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHour(),
        ]);

        $activityAt = now()->subHour();

        $focusLog = ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'telemetry.learner_focus_seconds',
            'model_type' => Lesson::class,
            'model_id' => $lesson->id,
            'description' => 'Timp de focus',
            'new_values' => [
                'seconds' => 1800,
                'lesson_id' => $lesson->id,
            ],
        ]);
        $focusLog->forceFill([
            'created_at' => $activityAt,
            'updated_at' => $activityAt,
        ])->save();

        $sessionLog = ActivityLog::create([
            'user_id' => $student->id,
            'action' => 'session_started',
            'description' => 'Sesiune dashboard test',
        ]);
        $sessionLog->forceFill([
            'created_at' => $activityAt,
            'updated_at' => $activityAt,
        ])->save();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard?period=7d');

        $response->assertOk()
            ->assertJsonPath('kpis.avg_learning_minutes.value', '30')
            ->assertJsonPath('kpis.avg_learning_minutes.sessions_count', 1)
            ->assertJsonPath('kpis.avg_learning_minutes_total.value', '120');

        $chartRows = collect($response->json('chart_data'));
        $this->assertTrue($chartRows->contains(fn ($row) => ($row['total_users'] ?? 0) >= 1));
        $this->assertTrue($chartRows->contains(fn ($row) => ($row['active_users'] ?? 0) >= 1));
        $this->assertSame(30, $chartRows->sum('learning_minutes'));

        $hourlyRow = collect($response->json('hourly_activity'))
            ->firstWhere('hour', (int) $activityAt->format('G'));
        $this->assertNotNull($hourlyRow);
        $this->assertSame(1, $hourlyRow['sessions']);
        $this->assertSame(1, $hourlyRow['visits']);
        $this->assertSame(1, $hourlyRow['users']);

        $activities = collect($response->json('recent_activities'))->pluck('description');
        $this->assertTrue($activities->contains(fn ($description) => str_contains($description, 'Lecție dashboard')));
    }

    public function test_admin_dashboard_omits_revenue_kpis_without_payments_module(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin Revenue',
            'email' => 'admin.revenue@example.com',
            'role' => 'admin',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard?period=30d');

        $response->assertOk()
            ->assertJsonMissingPath('kpis.revenue_gross')
            ->assertJsonMissingPath('kpis.revenue_net')
            ->assertJsonPath('integrations.payments', false);

        $firstChartPoint = $response->json('chart_data.0');
        if (is_array($firstChartPoint)) {
            $this->assertArrayNotHasKey('revenue', $firstChartPoint);
        }

        $topCourse = $response->json('top_courses.0');
        if (is_array($topCourse)) {
            $this->assertArrayNotHasKey('revenue', $topCourse);
        }
    }

    public function test_admin_statistics_course_test_detail_includes_both_result_tables(): void
    {
        [$student, $course, $test, $exam, $admin] = $this->seedResultsScenario(true);

        TestResult::create([
            'test_id' => $test->id,
            'user_id' => $student->id,
            'score' => 80,
            'max_score' => 100,
            'percentage' => 80,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'started_at' => now()->subMinutes(10),
            'completed_at' => now()->subMinutes(5),
        ]);

        ExamResult::create([
            'exam_id' => $exam->id,
            'user_id' => $student->id,
            'score' => 60,
            'total_points' => 100,
            'percentage' => 60,
            'passed' => true,
            'attempt_number' => 1,
            'answers' => ['1' => 0],
            'completed_at' => now()->subMinutes(3),
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/statistics/course-test-detail?course_id=' . $course->id);

        $response->assertOk();
        $this->assertCount(2, $response->json('test_results'));

        $titles = collect($response->json('test_results'))->pluck('test_title');
        $this->assertTrue($titles->contains($test->title));
        $this->assertTrue($titles->contains($exam->title));
    }

    /**
     * @return array{0:User,1:Course,2:Test,3:Exam,4?:User}
     */
    private function seedResultsScenario(bool $withAdmin = false): array
    {
        $student = User::factory()->create([
            'name' => 'Student One',
            'email' => 'student.metrics@example.com',
            'role' => 'student',
        ]);

        $owner = User::factory()->create([
            'name' => 'Course Owner',
            'email' => 'course.owner.metrics@example.com',
            'role' => 'teacher',
        ]);

        $course = Course::withoutEvents(function () use ($owner) {
            return Course::create([
                'title' => 'Curs pentru statistici',
                'description' => 'Curs folosit în testele de dashboard',
                'level' => 'beginner',
                'status' => 'published',
                'teacher_id' => $owner->id,
                'reward_points' => 100,
            ]);
        });

        $module = Module::withoutEvents(function () use ($course) {
            return Module::create([
                'course_id' => $course->id,
                'title' => 'Modulul 1',
                'description' => 'Modul pentru test',
                'order' => 1,
                'status' => 'published',
            ]);
        });

        $test = Test::withoutEvents(function () use ($owner) {
            return Test::create([
                'title' => 'Test statistici',
                'description' => 'Test folosit în dashboard',
                'type' => 'final',
                'status' => 'published',
                'time_limit_minutes' => 30,
                'max_attempts' => 3,
                'randomize_questions' => false,
                'randomize_answers' => false,
                'show_results_immediately' => true,
                'show_correct_answers' => false,
                'allow_review' => true,
                'question_source' => 'direct',
                'question_set_id' => null,
                'created_by' => $owner->id,
                'version' => '1.0.0',
            ]);
        });

        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'module',
            'scope_id' => $module->id,
            'required' => true,
            'passing_score' => 70,
            'order' => 1,
        ]);

        $exam = Exam::withoutEvents(function () use ($course, $owner) {
            return Exam::create([
                'course_id' => $course->id,
                'title' => 'Examen legacy',
                'description' => 'Examen pentru statistici',
                'status' => 'published',
                'max_score' => 100,
                'passing_score' => 70,
                'time_limit_minutes' => 30,
                'max_attempts' => 3,
                'is_required' => true,
                'created_by' => $owner->id,
            ]);
        });

        DB::table('course_user')->insert([
            'course_id' => $course->id,
            'user_id' => $student->id,
            'enrolled' => true,
            'enrolled_at' => now()->subDays(2),
            'started_at' => now()->subDay(),
            'completed_at' => null,
            'progress_percentage' => 25,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($withAdmin) {
            $admin = User::factory()->create([
                'name' => 'Admin User',
                'email' => 'admin.metrics@example.com',
                'role' => 'admin',
            ]);

            return [$student, $course, $test, $exam, $admin];
        }

        return [$student, $course, $test, $exam];
    }
}
