<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_mark_notification_read(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();

        $notification = Notification::create([
            'user_id' => $student->id,
            'type' => 'course_published',
            'title' => 'Curs nou',
            'description' => 'Test',
            'data' => ['course_id' => $course->id],
            'action_url' => '/courses/' . $course->id,
            'severity' => 'info',
        ]);

        $this->actingAs($student, 'sanctum')
            ->patchJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_mark_all_read_updates_all_for_user(): void
    {
        $student = User::factory()->create(['role' => 'student']);

        Notification::create([
            'user_id' => $student->id,
            'type' => 'course_enrolled',
            'title' => 'Înscriere',
            'description' => 'Test',
            'severity' => 'info',
        ]);

        $this->actingAs($student, 'sanctum')
            ->postJson('/api/notifications/mark-all-read')
            ->assertOk();

        $this->assertEquals(
            0,
            Notification::where('user_id', $student->id)->whereNull('read_at')->count()
        );
    }

    public function test_unread_count_endpoint(): void
    {
        $student = User::factory()->create(['role' => 'student']);

        Notification::create([
            'user_id' => $student->id,
            'type' => 'new_message',
            'title' => 'Mesaj',
            'description' => 'Salut',
            'severity' => 'info',
        ]);

        $this->actingAs($student, 'sanctum')
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('count', 1);
    }
}
