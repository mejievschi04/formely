<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseMap;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CourseMapProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_map_list_and_show_include_live_assigned_progress(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $done = Course::factory()->published()->create(['title' => 'Gata']);
        $pending = Course::factory()->published()->create(['title' => 'În lucru']);
        $map = CourseMap::create([
            'name' => 'Mapa progres',
            'description' => null,
            'visibility' => 'public',
            'order' => 0,
        ]);
        $map->courses()->attach([
            $done->id => ['order' => 0],
            $pending->id => ['order' => 1],
        ]);

        $this->enroll($student, $done);
        $this->enroll($student, $pending);
        $this->completePublishedRootLesson($student, $done);

        $list = $this->actingAs($student, 'sanctum')
            ->getJson('/api/course-maps')
            ->assertOk()
            ->json('data');

        $row = collect($list)->firstWhere('id', $map->id);
        $this->assertNotNull($row);
        $this->assertSame(50, (int) $row['progress_percentage']);

        $show = $this->actingAs($student, 'sanctum')
            ->getJson("/api/course-maps/{$map->id}")
            ->assertOk()
            ->json();

        $this->assertSame(50, (int) $show['progress_percentage']);
        $byTitle = collect($show['courses'])->keyBy('title');
        $this->assertSame(100, (int) $byTitle['Gata']['progress_percentage']);
        $this->assertSame(0, (int) $byTitle['În lucru']['progress_percentage']);
    }

    public function test_student_does_not_see_map_courses_that_are_not_assigned(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $mine = Course::factory()->published()->create(['title' => 'Al meu']);
        $other = Course::factory()->published()->create(['title' => 'Al altcuiva']);
        $emptyMap = CourseMap::create([
            'name' => 'Mapa altora',
            'description' => null,
            'visibility' => 'public',
            'order' => 1,
        ]);
        $map = CourseMap::create([
            'name' => 'Mapa mea',
            'description' => null,
            'visibility' => 'public',
            'order' => 0,
        ]);
        $map->courses()->attach([
            $mine->id => ['order' => 0],
            $other->id => ['order' => 1],
        ]);
        $emptyMap->courses()->attach($other->id, ['order' => 0]);
        $this->enroll($student, $mine);

        $list = $this->actingAs($student, 'sanctum')
            ->getJson('/api/course-maps')
            ->assertOk()
            ->json('data');

        $names = collect($list)->pluck('name')->all();
        $this->assertContains('Mapa mea', $names);
        $this->assertNotContains('Mapa altora', $names);
        $mineRow = collect($list)->firstWhere('name', 'Mapa mea');
        $this->assertSame(1, (int) $mineRow['courses_count']);

        $show = $this->actingAs($student, 'sanctum')
            ->getJson("/api/course-maps/{$map->id}")
            ->assertOk()
            ->json('courses');
        $titles = collect($show)->pluck('title')->all();
        $this->assertSame(['Al meu'], $titles);

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/course-maps/{$emptyMap->id}")
            ->assertNotFound();

        $this->actingAs($student, 'sanctum')
            ->getJson("/api/courses/{$other->id}")
            ->assertForbidden();
    }

    public function test_finished_course_is_not_listed_again_as_unfinished(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'active']);
        $course = Course::factory()->published()->create(['title' => 'De trecut']);
        $map = CourseMap::create([
            'name' => 'Mapa unica',
            'description' => null,
            'visibility' => 'public',
            'order' => 0,
        ]);
        $map->courses()->attach($course->id, ['order' => 0]);
        $this->enroll($student, $course);
        $this->completePublishedRootLesson($student, $course);

        $show = $this->actingAs($student, 'sanctum')
            ->getJson("/api/course-maps/{$map->id}")
            ->assertOk()
            ->json('courses.0');
        $this->assertSame(100, (int) $show['progress_percentage']);
        $this->assertNotEmpty($show['completed_at']);

        $this->actingAs($student, 'sanctum')
            ->getJson('/api/course-maps')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Mapa unica']);
    }

    private function enroll(User $student, Course $course): void
    {
        $row = [
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'progress_percentage' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('course_user', 'assignment_source')) {
            $row['assignment_source'] = 'direct';
        }
        DB::table('course_user')->insert($row);
    }

    private function completePublishedRootLesson(User $student, Course $course): void
    {
        $lesson = Lesson::withoutEvents(function () use ($course) {
            return Lesson::create([
                'course_id' => $course->id,
                'module_id' => null,
                'title' => 'Lecție',
                'content' => '<p>Test</p>',
                'type' => 'text',
                'status' => 'published',
                'order' => 1,
            ]);
        });

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
