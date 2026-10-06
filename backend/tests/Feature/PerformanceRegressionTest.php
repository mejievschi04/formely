<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Services\CourseProgressService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PerformanceRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_course_progress_query_count_does_not_grow_per_lesson(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $course->assignedUsers()->attach($student->id, ['enrolled' => true]);
        $counts = [];
        foreach ([2, 40] as $total) {
            for ($i = $course->lessons()->count(); $i < $total; $i++) {
                $lesson = Lesson::withoutEvents(fn () => Lesson::create([
                    'course_id' => $course->id, 'module_id' => null,
                    'title' => 'Lecție '.$i, 'content' => 'Test',
                    'type' => 'text', 'status' => 'published', 'order' => $i,
                ]));
                DB::table('lesson_progress')->insert([
                    'lesson_id' => $lesson->id, 'user_id' => $student->id,
                    'completed' => false, 'progress_percentage' => $i % 2 === 0 ? 100 : 0,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            $this->app->forgetInstance(CourseProgressService::class);
            $service = app(CourseProgressService::class);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->assertSame(50.0, $service->calculateCourseProgress($student, $course));
            $counts[] = count(DB::getQueryLog());
            DB::disableQueryLog();
        }

        $this->assertLessThanOrEqual(8, $counts[0]);
        $this->assertLessThanOrEqual($counts[0], $counts[1], 'Progress must batch lesson queries.');
    }

    public function test_learning_time_aggregates_respect_course_and_student_filters(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $students = User::factory()->count(2)->create(['role' => 'student']);
        $courses = Course::factory()->count(2)->published()->create();
        foreach ($courses as $course) {
            $lesson = Lesson::withoutEvents(fn () => Lesson::create([
                'course_id' => $course->id, 'title' => 'Lecție', 'content' => 'Test',
                'type' => 'text', 'status' => 'published', 'order' => 1,
            ]));
            foreach ($students as $student) {
                DB::table('lesson_progress')->insert([
                    'user_id' => $student->id, 'lesson_id' => $lesson->id,
                    'time_spent_seconds' => 60, 'completed' => true,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        $url = '/api/admin/statistics/course-test-detail?course_id='.$courses[0]->id.'&user_id='.$students[0]->id;
        $this->actingAs($admin, 'sanctum')->getJson($url)
            ->assertOk()->assertJsonPath('meta.total_learning_seconds', 60);
    }

    public function test_auth_reports_volt_configuration_without_exposing_keys(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        config(['ai.provider' => 'groq', 'ai.groq.api_key' => '']);
        $this->actingAs($student, 'sanctum')->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('user.capabilities.volt', false);
        config(['ai.groq.api_key' => 'test-only-secret']);
        $response = $this->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('user.capabilities.volt', true);
        $this->assertStringNotContainsString('test-only-secret', $response->getContent());
    }
}
