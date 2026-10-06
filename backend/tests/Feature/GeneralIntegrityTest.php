<?php

namespace Tests\Feature;

use App\Models\{Course, CourseTest, Lesson, Module, Question, Test, TestResult, User};
use App\Services\LmsBackupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{File, Storage};
use Tests\TestCase;

class GeneralIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function lesson(Course $course, ?Module $module = null): Lesson
    {
        return Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => $module?->id, 'title' => 'Audit',
            'content' => 'Audit content', 'type' => 'text', 'order' => 0, 'status' => 'draft',
        ]));
    }

    public function test_instructor_cannot_move_module_into_another_instructors_course(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $own = Course::factory()->create(['teacher_id' => $instructor->id]);
        $foreign = Course::factory()->create();
        $module = Module::withoutEvents(fn () => Module::create(['course_id' => $own->id, 'title' => 'Audit', 'order' => 0]));
        $lesson = $this->lesson($own, $module);
        $this->actingAs($instructor, 'sanctum')->putJson("/api/admin/modules/{$module->id}", ['course_id' => $foreign->id])->assertStatus(422);
        $this->assertSame($own->id, $module->fresh()->course_id);
        $this->assertSame($own->id, $lesson->fresh()->course_id);
    }

    public function test_instructor_cannot_move_lesson_into_foreign_module(): void
    {
        $instructor = User::factory()->create(['role' => 'instructor']);
        $own = Course::factory()->create(['teacher_id' => $instructor->id]);
        $foreign = Course::factory()->create();
        $module = Module::withoutEvents(fn () => Module::create(['course_id' => $foreign->id, 'title' => 'Foreign', 'order' => 0]));
        $lesson = $this->lesson($own);
        $this->actingAs($instructor, 'sanctum')->putJson("/api/admin/lessons/{$lesson->id}", ['module_id' => $module->id])->assertStatus(422);
        $this->assertNull($lesson->fresh()->module_id);
        $this->assertSame($own->id, $lesson->fresh()->course_id);
    }

    public function test_null_clears_lesson_video(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $lesson = $this->lesson(Course::factory()->create());
        $lesson->update(['video_url' => 'https://example.com/old-video']);
        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/lessons/{$lesson->id}", ['video_url' => null])->assertOk();
        $this->assertNull($lesson->fresh()->video_url);
    }
    public function test_two_avatar_uploads_in_same_second_keep_current_file(): void
    {
        Storage::fake('public');
        $this->freezeTime();
        $user = User::factory()->create(['role' => 'student']);
        $this->actingAs($user, 'sanctum')->postJson('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('first.png')])->assertOk();
        Storage::disk('public')->assertExists($user->fresh()->avatar);
        $this->postJson('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('second.png')])->assertOk();
        Storage::disk('public')->assertExists($user->fresh()->avatar);
    }

    public function test_staff_preview_can_submit_nonempty_test(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $test = Test::factory()->published()->create();
        $q = Question::factory()->create(['test_id' => $test->id]);
        $this->actingAs($admin, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->postJson("/api/exams/{$test->id}/submit", ['answers' => [$q->id => 0]])
            ->assertOk()
            ->assertJsonPath('result.passed', true);
        $this->assertSame(0, TestResult::where('user_id', $admin->id)->count());
    }

    public function test_attempt_cannot_be_reassigned_to_another_course_at_submit(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $first = Course::factory()->published()->create();
        $second = Course::factory()->published()->create();
        $test = Test::factory()->published()->create(['time_limit_minutes' => null]);
        $q = Question::factory()->create(['test_id' => $test->id]);
        foreach ([$first, $second] as $course) {
            $course->assignedUsers()->attach($student->id, ['enrolled' => true]);
            CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course']);
        }
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$first->id}")->assertOk();
        $attempt = TestResult::where('user_id', $student->id)->where('test_id', $test->id)->firstOrFail();
        // Încercările se numără pe test, nu pe curs: trimiterea din alt curs e acceptată,
        // dar rezultatul rămâne pe cursul în care a fost deschisă încercarea.
        $this->postJson("/api/exams/{$test->id}/submit?course_id={$second->id}", [
            'attempt_id' => $attempt->id,
            'answers' => [$q->id => 0],
        ])->assertOk();
        $this->assertSame($first->id, $attempt->fresh()->course_id);
        $this->assertNotNull($attempt->fresh()->completed_at);
    }

    public function test_failed_backup_restore_keeps_existing_rows(): void
    {
        $dir = sys_get_temp_dir() . '/volta-audit-restore-' . bin2hex(random_bytes(6));
        File::ensureDirectoryExists($dir);
        $user = User::factory()->create();
        File::put($dir . '/manifest.json', '{}');
        File::put($dir . '/database.json', json_encode(['tables' => ['users' => [['id' => 999, 'not_a_real_column' => 'invalid']]]]));
        try {
            try {
                app(LmsBackupService::class)->restore($dir);
                $this->fail('Expected malformed backup to fail');
            } catch (\InvalidArgumentException $e) {
                $this->assertNotNull(User::find($user->id));
            }
        } finally {
            File::deleteDirectory($dir);
        }
    }

    public function test_two_backups_in_same_second_use_distinct_directories(): void
    {
        Storage::fake('public');
        $this->freezeTime();
        $root = sys_get_temp_dir() . '/volta-audit-backup-' . bin2hex(random_bytes(6));
        $service = new class($root) extends LmsBackupService {
            public function __construct(private string $auditRoot) {}
            public function backupRoot(): string { return $this->auditRoot; }
        };
        try {
            $user = User::factory()->create(['name' => 'First']);
            $first = $service->createBackup();
            $user->update(['name' => 'Second']);
            $second = $service->createBackup();
            $this->assertNotSame($first['path'], $second['path']);
            $json = json_decode(File::get($first['path'] . '/database.json'), true);
            $usersTable = collect($json['tables'])->first(fn ($rows, $name) => $name === 'users' || str_ends_with((string) $name, '.users'));
            $this->assertSame('First', $usersTable[0]['name']);
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_submit_rejects_conflicting_body_course_id(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $allowed = Course::factory()->published()->create();
        $forbidden = Course::factory()->published()->create();
        $allowed->assignedUsers()->attach($student->id, ['enrolled' => true]);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null]);
        $q = Question::factory()->create(['test_id' => $test->id]);
        foreach ([$allowed, $forbidden] as $course) {
            CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course']);
        }
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$forbidden->id}")->assertForbidden();
        $this->getJson("/api/exams/{$test->id}?course_id={$allowed->id}")->assertOk();
        $this->postJson("/api/exams/{$test->id}/submit?course_id={$allowed->id}", [
            'course_id' => $forbidden->id, 'answers' => [$q->id => 0],
        ])->assertStatus(422);
        $this->assertDatabaseMissing('test_results', ['user_id' => $student->id, 'course_id' => $forbidden->id, 'passed' => true]);
    }

    public function test_passing_threshold_snapshot_is_kept_at_submit(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['passing_score' => 90, 'time_limit_minutes' => null]);
        $first = Question::factory()->create(['test_id' => $test->id, 'points' => 8]);
        $second = Question::factory()->create(['test_id' => $test->id, 'points' => 2]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $attempt = TestResult::where('test_id', $test->id)->firstOrFail();
        $this->assertSame(90, (int) $attempt->passing_score_applied);
        $test->update(['passing_score' => 70]);
        $this->postJson("/api/exams/{$test->id}/submit", ['answers' => [$first->id => 0, $second->id => 1]])
            ->assertOk()
            ->assertJsonPath('result.passed', false);
        $this->assertSame(90, (int) $attempt->fresh()->passing_score_applied);
    }

    public function test_deleting_live_lesson_in_draft_keeps_student_url(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['workflow_status' => 'published', 'sequential_unlock' => false]);
        $course->assignedUsers()->attach($student->id, ['enrolled' => true]);
        $lesson = $this->lesson($course);
        $lesson->update(['status' => 'published']);
        $service = app(\App\Services\CourseBuilderService::class);
        $service->createCourseVersionSnapshot($course->id, null, 'published');
        $this->actingAs($student, 'sanctum')->getJson("/api/lessons/{$lesson->id}")->assertOk();
        $service->deleteLesson($lesson);
        $this->assertSame('editing', $course->fresh()->workflow_status);
        $this->getJson("/api/lessons/{$lesson->id}")->assertOk()->assertJsonPath('title', 'Audit');
    }

    public function test_library_strips_executable_html_for_student_reader(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $html = '<p>Audit</p><img src="invalid:" onerror="window.__voltaAuditExecuted=true">';
        $this->actingAs($admin, 'sanctum')->postJson('/api/library/items', [
            'title' => 'Audit HTML', 'content_type' => 'text', 'body' => $html,
        ])->assertCreated();
        $item = \App\Models\LibraryItem::where('title', 'Audit HTML')->firstOrFail();
        $this->assertStringNotContainsString('onerror', (string) $item->body);
        $student = User::factory()->create(['role' => 'student']);
        $response = $this->actingAs($student, 'sanctum')->getJson("/api/library/items/{$item->id}")->assertOk();
        $this->assertStringNotContainsString('onerror', $response->getContent());
        $this->assertStringContainsString('Audit', $response->getContent());
    }
}
