<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Paginile cursantului nu trebuie să facă o interogare în plus pentru fiecare lecție
 * (verificarea înscrierii, testele lecției, lecțiile modulului se încarcă o singură dată).
 */
class StudentQueryScalingTest extends TestCase
{
    use RefreshDatabase;

    public function test_course_and_progress_queries_do_not_grow_with_lesson_count(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $small = $this->courseWithLessons($student, 3);
        $large = $this->courseWithLessons($student, 12);

        foreach (['/api/courses/%d', '/api/courses/%d/progress'] as $pattern) {
            $smallCount = $this->queryCount($student, sprintf($pattern, $small->id));
            $largeCount = $this->queryCount($student, sprintf($pattern, $large->id));

            $this->assertSame($smallCount, $largeCount, sprintf(
                '%s: %d interogări cu 3 lecții/modul, %d cu 12 lecții/modul',
                $pattern,
                $smallCount,
                $largeCount
            ));
        }
    }

    private function courseWithLessons(User $student, int $lessonsPerModule): Course
    {
        $course = Course::withoutEvents(fn () => Course::factory()->published()->create(['sequential_unlock' => true]));
        $order = 0;
        foreach (range(1, 2) as $m) {
            $module = Module::withoutEvents(fn () => Module::create([
                'course_id' => $course->id,
                'title' => "Modul {$m}",
                'order' => $m,
                'status' => 'published',
            ]));
            foreach (range(1, $lessonsPerModule) as $l) {
                $lesson = Lesson::withoutEvents(fn () => Lesson::create([
                    'course_id' => $course->id,
                    'module_id' => $module->id,
                    'title' => "Lecția {$m}.{$l}",
                    'content' => '<p>Conținut</p>',
                    'type' => 'text',
                    'status' => 'published',
                    'order' => ++$order,
                ]));
                if ($order <= 2) {
                    DB::table('lesson_progress')->insert([
                        'user_id' => $student->id,
                        'lesson_id' => $lesson->id,
                        'completed' => true,
                        'progress_percentage' => 100,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        $test = Test::factory()->published()->create();
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $test->id,
            'scope' => 'course',
            'required' => true,
            'passing_score' => 70,
            'order' => 0,
        ]);
        DB::table('course_user')->insert([
            'course_id' => $course->id,
            'user_id' => $student->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'is_mandatory' => false,
            'assigned_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $course;
    }

    private function queryCount(User $student, string $url): int
    {
        // Un apel de încălzire: primul request mai citește schema și cache-uri; măsurăm al doilea.
        $this->actingAs($student, 'sanctum')->getJson($url)->assertOk();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($student, 'sanctum')->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }
}
