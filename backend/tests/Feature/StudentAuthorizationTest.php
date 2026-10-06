<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\GuideItem;
use App\Models\Lesson;
use App\Models\LibraryItem;
use App\Models\Notification;
use App\Models\Test;
use App\Models\TestResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Un cursant nu ajunge, schimbând id-ul din adresă, la datele altui cursant sau la cursuri
 * care nu i-au fost atribuite, și nu modifică materiale pe care nu le-a creat.
 */
class StudentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_cannot_reach_other_students_data_or_unassigned_courses(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $a = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $b = User::factory()->create(['role' => 'student', 'status' => 'active']);

        // curs publicat, atribuit doar lui B
        $course = Course::withoutEvents(fn () => Course::factory()->published()->create());
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'title' => 'Lecție', 'content' => '<p>secret</p>',
            'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        $test = Test::factory()->published()->create(['created_by' => $admin->id]);
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course', 'required' => true, 'passing_score' => 50, 'order' => 0]);
        \DB::table('course_user')->insert([
            'course_id' => $course->id, 'user_id' => $b->id, 'enrolled' => true, 'enrolled_at' => now(),
            'is_mandatory' => false, 'assigned_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $result = TestResult::create([
            'test_id' => $test->id, 'course_id' => $course->id, 'user_id' => $b->id, 'score' => 1, 'max_score' => 1,
            'percentage' => 100, 'passed' => true, 'attempt_number' => 1, 'answers' => [], 'completed_at' => now(), 'status' => 'completed',
        ]);
        $notification = Notification::create([
            'user_id' => $b->id, 'type' => 'course_published', 'title' => 'Doar pentru B', 'description' => 'x', 'severity' => 'info',
        ]);
        $guide = GuideItem::create(['user_id' => $admin->id, 'title' => 'Ghid', 'url' => 'https://example.com']);
        $library = LibraryItem::create(['user_id' => $admin->id, 'title' => 'Material', 'content_type' => 'text', 'body' => 'x']);

        $checks = [
            ['GET', "/api/exam-results/{$result->id}?type=test"],
            ['PATCH', "/api/notifications/{$notification->id}/read"],
            ['POST', "/api/guides/items/{$guide->id}", ['title' => 'Schimbat']],
            ['DELETE', "/api/guides/items/{$guide->id}"],
            ['POST', "/api/library/items/{$library->id}", ['title' => 'Schimbat']],
            ['DELETE', "/api/library/items/{$library->id}"],
            ['GET', "/api/courses/{$course->id}"],
            ['GET', "/api/courses/{$course->id}/progress"],
            ['GET', "/api/lessons/{$lesson->id}"],
            ['POST', "/api/lessons/{$lesson->id}/complete"],
            ['PUT', "/api/lessons/{$lesson->id}/progress", ['progress_percentage' => 100]],
            ['GET', "/api/exams/{$test->id}?course_id={$course->id}"],
            ['POST', "/api/exams/{$test->id}/submit", ['answers' => [], 'course_id' => $course->id]],
            ['POST', "/api/courses/{$course->id}/finish"],
        ];

        $allowed = [];
        foreach ($checks as $check) {
            [$method, $url] = $check;
            $this->app['auth']->forgetGuards();
            $status = $this->actingAs($a, 'sanctum')->json($method, $url, $check[2] ?? [])->status();
            if (! in_array($status, [401, 403, 404, 422], true)) {
                $allowed[] = "{$method} {$url} → {$status}";
            }
        }

        $this->assertSame([], $allowed, "Cursantul A a primit acces:\n" . implode("\n", $allowed));

        // nimic nu s-a schimbat
        $this->assertNull($notification->fresh()->read_at);
        $this->assertSame('Ghid', $guide->fresh()->title);
        $this->assertSame('Material', $library->fresh()->title);
        $this->assertDatabaseMissing('lesson_progress', ['user_id' => $a->id, 'lesson_id' => $lesson->id]);
    }
}
