<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TelemetryTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_send_learner_attempt_started(): void
    {
        $student = User::factory()->create(['role' => 'student']);

        $this->actingAs($student, 'sanctum')
            ->postJson('/api/telemetry/events', [
                'event_name' => 'learner_attempt_started',
                'payload' => ['exam_id' => 12, 'course_id' => 3],
                'model_type' => 'exam',
                'model_id' => 12,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $student->id,
            'action' => 'telemetry.learner_attempt_started',
            'model_id' => 12,
        ]);
    }

    public function test_student_can_send_learner_attempt_submitted(): void
    {
        $student = User::factory()->create(['role' => 'student']);

        $this->actingAs($student, 'sanctum')
            ->postJson('/api/telemetry/events', [
                'event_name' => 'learner_attempt_submitted',
                'payload' => ['passed' => true, 'percentage' => 85],
                'model_type' => 'exam',
                'model_id' => 5,
            ])
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $student->id,
            'action' => 'telemetry.learner_attempt_submitted',
        ]);
    }

    public function test_invalid_telemetry_event_rejected(): void
    {
        $student = User::factory()->create(['role' => 'student']);

        $this->actingAs($student, 'sanctum')
            ->postJson('/api/telemetry/events', [
                'event_name' => 'unknown_event',
                'payload' => [],
            ])
            ->assertStatus(422);
    }
}
