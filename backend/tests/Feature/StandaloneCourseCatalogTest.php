<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseMap;
use App\Models\User;
use App\Services\UserAssignedCoursesService;
use App\Support\CourseCatalog;
use App\Support\CourseMapBuckets;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class StandaloneCourseCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_sees_only_published_assigned_courses_outside_maps(): void
    {
        $this->assertTrue(Schema::hasColumn('courses', 'settings'));

        $student = User::factory()->create(['role' => 'student']);

        $catalogCourse = Course::factory()->published()->create([
            'title' => 'Catalog Direct',
        ]);
        CourseCatalog::applyOutsideMapFlag($catalogCourse, true);
        app(UserAssignedCoursesService::class)->assignCourseDirectly($student, $catalogCourse, []);

        $unassigned = Course::factory()->published()->create([
            'title' => 'Catalog neatribuit',
        ]);
        CourseCatalog::applyOutsideMapFlag($unassigned, true);

        Course::factory()->published()->create([
            'title' => 'Doar in mapa',
        ]);

        Course::factory()->create([
            'title' => 'Draft catalog',
            'status' => 'draft',
        ]);
        CourseCatalog::applyOutsideMapFlag(
            Course::where('title', 'Draft catalog')->first(),
            true
        );

        $response = $this->actingAs($student)->getJson('/api/courses/standalone');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonFragment(['title' => 'Catalog Direct']);
        $response->assertJsonMissing(['title' => 'Catalog neatribuit']);
        $response->assertJsonMissing(['title' => 'Doar in mapa']);
    }

    public function test_courses_outside_maps_are_those_without_a_visible_map(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $assign = fn (Course $course) => app(UserAssignedCoursesService::class)->assignCourseDirectly($student, $course, []);

        $noMap = Course::factory()->published()->create(['title' => 'Fara mapa']);
        $inDefault = Course::factory()->published()->create(['title' => 'Doar in mapa implicita']);
        $inMap = Course::factory()->published()->create(['title' => 'In mapa Productie']);
        $flaggedInMap = Course::factory()->published()->create(['title' => 'Bifat si in mapa']);
        $inPrivate = Course::factory()->published()->create(['title' => 'Doar in mapa privata']);
        foreach ([$noMap, $inDefault, $inMap, $flaggedInMap, $inPrivate] as $course) {
            $assign($course);
        }
        CourseCatalog::applyOutsideMapFlag($flaggedInMap, true);

        $default = CourseMap::create(['name' => CourseMapBuckets::DEFAULT_MAP_NAME, 'created_by' => $student->id]);
        $map = CourseMap::create(['name' => 'Productie', 'created_by' => $student->id, 'visibility' => 'public']);
        $private = CourseMap::create(['name' => 'Ascunsa', 'created_by' => $student->id, 'visibility' => 'private']);
        $inDefault->courseMaps()->attach($default->id, ['order' => 0]);
        $inMap->courseMaps()->attach($map->id, ['order' => 0]);
        $flaggedInMap->courseMaps()->attach($map->id, ['order' => 1]);
        $inPrivate->courseMaps()->attach($private->id, ['order' => 0]);

        $titles = collect($this->actingAs($student)->getJson('/api/courses/standalone')->assertOk()->json('data'))
            ->pluck('title')->sort()->values()->all();
        $this->assertSame(['Doar in mapa implicita', 'Doar in mapa privata', 'Fara mapa'], $titles);

        $maps = $this->actingAs($student)->getJson('/api/course-maps')->assertOk()->json('data');
        $this->assertSame(['Productie'], collect($maps)->pluck('name')->all());
        $this->assertSame(2, $maps[0]['courses_count']);
    }
}
