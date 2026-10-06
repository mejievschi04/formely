<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseMap;
use App\Models\User;
use App\Services\UserAssignedCoursesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemCourseMapTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_turns_a_map_into_a_system_map_hidden_from_students(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['title' => 'Curs din mapa de sistem']);
        app(UserAssignedCoursesService::class)->assignCourseDirectly($student, $course, []);
        $map = CourseMap::create(['name' => 'Arhivă internă', 'created_by' => $admin->id, 'visibility' => 'public']);
        $course->courseMaps()->attach($map->id, ['order' => 0]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/course-maps/{$map->id}", ['visibility' => 'private'])
            ->assertOk();
        $this->assertSame('private', $map->fresh()->visibility);

        // cursantul nu vede mapa, dar cursul îi apare direct în pagina Cursuri
        $this->actingAs($student, 'sanctum')->getJson('/api/course-maps')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Arhivă internă']);
        $this->actingAs($student, 'sanctum')->getJson("/api/course-maps/{$map->id}")->assertNotFound();
        $this->actingAs($student, 'sanctum')->getJson('/api/courses/standalone')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Curs din mapa de sistem']);
    }

    public function test_instructor_cannot_change_map_visibility(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $map = CourseMap::create(['name' => 'Mapa mea', 'created_by' => $instructor->id, 'visibility' => 'public']);

        $this->actingAs($instructor, 'sanctum')
            ->putJson("/api/admin/course-maps/{$map->id}", ['name' => 'Mapa mea', 'visibility' => 'private']);

        $this->assertSame('public', $map->fresh()->visibility);
    }
}
