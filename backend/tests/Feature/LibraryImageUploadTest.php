<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LibraryImageUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_uploads_an_image_for_a_written_library_item(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->post('/api/library/images', ['file' => UploadedFile::fake()->image('schema.png', 40, 40)], ['Accept' => 'application/json'])
            ->assertCreated();

        $this->assertStringStartsWith('/storage/library/images/', $response->json('url'));
        Storage::disk('public')->assertExists($response->json('path'));
    }

    public function test_students_and_non_images_are_rejected(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $this->actingAs($student, 'sanctum')
            ->post('/api/library/images', ['file' => UploadedFile::fake()->image('x.png')], ['Accept' => 'application/json'])
            ->assertForbidden();

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'sanctum')
            ->post('/api/library/images', ['file' => UploadedFile::fake()->create('doc.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable();
    }
}
