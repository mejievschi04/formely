<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseListingTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_sees_only_published_courses(): void
    {
        Course::factory()->published()->create([
            'title' => 'Public Course',
            'status' => 'published',
        ]);

        Course::factory()->create([
            'title' => 'Draft Course',
            'status' => 'draft',
        ]);

        $response = $this->getJson('/api/courses');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonFragment(['title' => 'Public Course']);
        $response->assertJsonMissing(['title' => 'Draft Course']);
    }

    public function test_admin_sees_published_and_draft_courses(): void
    {
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'role' => 'admin',
        ]);

        Course::factory()->published()->create([
            'title' => 'Public Course',
            'status' => 'published',
        ]);

        Course::factory()->create([
            'title' => 'Draft Course',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/courses');

        $response->assertOk();
        $response->assertJsonCount(2);
        $response->assertJsonFragment(['title' => 'Public Course']);
        $response->assertJsonFragment(['title' => 'Draft Course']);
    }
}
