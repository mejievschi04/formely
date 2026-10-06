<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\MediaAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    private function asset(Course $course, User $uploader, string $name): MediaAsset
    {
        Storage::disk('public')->put("content-blocks/document/{$name}", 'pdf');

        return MediaAsset::create([
            'course_id' => $course->id,
            'uploaded_by_user_id' => $uploader->id,
            'disk' => 'public',
            'type' => 'document',
            'path' => "content-blocks/document/{$name}",
            'filename' => $name,
            'mime_type' => 'application/pdf',
            'size' => 3,
        ]);
    }

    public function test_admin_lists_and_deletes_an_unused_file(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $course = Course::factory()->create();
        $asset = $this->asset($course, $admin, 'nefolosit.pdf');

        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/media')
            ->assertOk()
            ->assertJsonPath('data.0.filename', 'nefolosit.pdf');

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/media/{$asset->id}")->assertOk();
        $this->assertDatabaseMissing('media_assets', ['id' => $asset->id]);
        Storage::disk('public')->assertMissing('content-blocks/document/nefolosit.pdf');
    }

    public function test_file_used_by_id_url_in_a_lesson_cannot_be_deleted(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $course = Course::factory()->create();
        $asset = $this->asset($course, $admin, 'folosit.pdf');
        // PDF-urile sunt inserate în lecție cu adresa bazată pe id, nu cu calea fișierului
        Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lecția cu PDF',
            'content' => "<p><a href=\"/api/builder-media/{$course->id}/{$asset->id}?token=abc\">PDF</a></p>",
            'type' => 'text',
            'status' => 'published',
            'order' => 1,
        ]));

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/media/{$asset->id}")
            ->assertStatus(409)
            ->assertJsonPath('in_use', true)
            ->assertJsonPath('usages.0.lesson_title', 'Lecția cu PDF');
        $this->assertDatabaseHas('media_assets', ['id' => $asset->id]);
    }

    public function test_instructor_sees_and_deletes_only_own_files(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin', 'status' => 'active']);
        $instructor = User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        $course = Course::factory()->create();
        $own = $this->asset($course, $instructor, 'al-meu.pdf');
        $other = $this->asset($course, $admin, 'al-adminului.pdf');

        $this->actingAs($instructor, 'sanctum')->getJson('/api/admin/media')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $own->id);

        $this->actingAs($instructor, 'sanctum')->deleteJson("/api/admin/media/{$other->id}")->assertForbidden();
    }
}
