<?php

namespace Tests\Feature;

use App\Models\{ContentBlock, Course, CourseMap, CourseTest, Lesson, MediaAsset, Module, Question, Team, Test, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CourseDuplicateTest extends TestCase
{
    use RefreshDatabase;

    public function test_duplicate_is_an_independent_draft_copy(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Storage::disk('public')->put('courses/cover.jpg', 'img');

        $course = Course::factory()->published()->create([
            'title' => 'Siguranța muncii',
            'image' => 'courses/cover.jpg',
            'total_enrollments' => 12,
            'views_count' => 40,
        ]);
        $map = CourseMap::create(['name' => 'Producție', 'created_by' => $admin->id]);
        $course->courseMaps()->attach($map->id, ['order' => 0]);
        $team = Team::create(['name' => 'Echipa A', 'owner_id' => $admin->id]);
        $course->teams()->attach($team->id);

        $asset = MediaAsset::create([
            'course_id' => $course->id, 'uploaded_by_user_id' => $admin->id, 'disk' => 'public',
            'type' => 'document', 'path' => 'builder/manual.pdf', 'filename' => 'manual.pdf',
        ]);
        $pdfUrl = "/api/builder-media/{$course->id}/{$asset->id}?token=" . MediaAsset::previewToken($course->id, $asset->id);

        [$module1, $module2, $lesson1, $lesson2] = Lesson::withoutEvents(fn () => Module::withoutEvents(function () use ($course, $pdfUrl) {
            $module1 = Module::create(['course_id' => $course->id, 'title' => 'M1', 'order' => 0, 'status' => 'published']);
            $lesson1 = Lesson::create([
                'course_id' => $course->id, 'module_id' => $module1->id, 'title' => 'L1', 'content' => 'A',
                'type' => 'text', 'status' => 'published', 'order' => 0, 'views_count' => 9,
            ]);
            $module2 = Module::create([
                'course_id' => $course->id, 'title' => 'M2', 'order' => 1, 'status' => 'published',
                'unlock_after_module_id' => $module1->id,
            ]);
            $lesson2 = Lesson::create([
                'course_id' => $course->id, 'module_id' => $module2->id, 'title' => 'L2',
                'content' => "<a href=\"{$pdfUrl}\">PDF</a>", 'type' => 'text', 'status' => 'published',
                'order' => 0, 'unlock_after_lesson_id' => $lesson1->id,
            ]);

            return [$module1, $module2, $lesson1, $lesson2];
        }));
        ContentBlock::withoutEvents(fn () => ContentBlock::create([
            'lesson_id' => $lesson2->id, 'type' => 'file', 'source' => '', 'order' => 0, 'visible' => true,
            'payload' => ['url' => $pdfUrl],
        ]));

        $test = Test::factory()->published()->create(['title' => 'Test final', 'attempts_count' => 5]);
        Question::factory()->create(['test_id' => $test->id]);
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'module', 'scope_id' => $module2->id, 'required' => true]);

        $copyId = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/builder/clone", ['include_teams' => false])
            ->assertCreated()
            ->json('course.id');

        $copy = Course::findOrFail($copyId);
        $this->assertSame('Siguranța muncii (copie)', $copy->title);
        $this->assertSame('draft', $copy->status);
        $this->assertSame('draft', $copy->workflow_status);
        $this->assertSame(0, (int) $copy->total_enrollments);
        $this->assertSame(0, (int) $copy->views_count);
        $this->assertSame(0, $copy->teams()->count());
        $this->assertSame([$map->id], $copy->courseMaps()->pluck('course_maps.id')->all());

        // Coperta proprie: ștergerea originalului nu o rupe.
        $this->assertNotSame('courses/cover.jpg', $copy->image);
        Storage::disk('public')->assertExists($copy->image);

        $copyModules = Module::where('course_id', $copyId)->orderBy('order')->get();
        $copyLessons = Lesson::where('course_id', $copyId)->get()->keyBy('title');
        $this->assertSame($copyModules[0]->id, (int) $copyModules[1]->unlock_after_module_id);
        $this->assertSame($copyLessons['L1']->id, (int) $copyLessons['L2']->unlock_after_lesson_id);
        $this->assertSame(0, (int) $copyLessons['L1']->views_count);

        // PDF-urile indică rândul media al copiei.
        $copyAsset = MediaAsset::where('course_id', $copyId)->firstOrFail();
        $copyPdfUrl = "/api/builder-media/{$copyId}/{$copyAsset->id}?token=" . MediaAsset::previewToken($copyId, $copyAsset->id);
        $this->assertStringContainsString($copyPdfUrl, $copyLessons['L2']->content);
        $this->assertSame($copyPdfUrl, ContentBlock::where('lesson_id', $copyLessons['L2']->id)->first()->payload['url']);

        $link = CourseTest::where('course_id', $copyId)->firstOrFail();
        $this->assertSame($copyModules[1]->id, (int) $link->scope_id);
        $copyTest = Test::findOrFail($link->test_id);
        $this->assertNotSame($test->id, $copyTest->id);
        $this->assertSame('Test final (copie)', $copyTest->title);
        $this->assertSame('published', $copyTest->status);
        $this->assertSame(0, (int) $copyTest->attempts_count);
        $this->assertSame(1, $copyTest->questions()->count());

        // Originalul rămâne neatins.
        $this->assertSame('Siguranța muncii', $course->fresh()->title);
        $this->assertSame(1, $course->teams()->count());
        $this->assertSame($module1->id, (int) $module2->fresh()->unlock_after_module_id);
        $this->assertSame($pdfUrl, ContentBlock::where('lesson_id', $lesson2->id)->first()->payload['url']);
    }

    public function test_instructor_cannot_duplicate_someone_elses_course(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $course = Course::factory()->create();

        $this->actingAs($instructor, 'sanctum')
            ->postJson("/api/admin/courses/{$course->id}/builder/clone")
            ->assertForbidden();
    }
}
