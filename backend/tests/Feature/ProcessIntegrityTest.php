<?php

namespace Tests\Feature;

use App\Models\{Course, CourseTest, Event, Lesson, Question, Setting, Test, User};
use App\Services\{CourseBuilderService, NotificationService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProcessIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function lesson(Course $course): Lesson
    {
        return Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Audit lesson',
            'content' => 'Lesson content', 'type' => 'text', 'status' => 'draft', 'order' => 0,
        ]));
    }

    private function event(): Event
    {
        return Event::create([
            'title' => 'Audit event', 'description' => 'Audit description', 'type' => 'webinar', 'status' => 'published',
            'start_date' => now()->addDay()->format('Y-m-d H:i:s'),
            'end_date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'access_type' => 'course_included', 'live_link' => 'https://example.com/private-live',
            'replay_url' => 'https://example.com/private-replay',
        ]);
    }

    public function test_suspended_account_cannot_access_authenticated_api(): void
    {
        $student = User::factory()->create(['role' => 'student', 'status' => 'suspended']);
        $token = $student->createToken('audit')->plainTextToken;
        $this->withToken($token)->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertJsonPath('account_status', 'suspended');
    }

    public function test_registration_disabled_setting_blocks_public_signup(): void
    {
        Setting::set('registration_enabled', '0', 'boolean');
        $this->mock(NotificationService::class, fn ($mock) => $mock->shouldReceive('notifyRegistrationRequested')->never());
        $this->postJson('/api/auth/register', [
            'name' => 'Audit User', 'email' => 'audit@example.com', 'password' => 'Password123',
        ])->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'audit@example.com']);
    }
    public function test_course_publish_rejects_empty_required_test(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $course = Course::factory()->create();
        $this->lesson($course);
        $test = Test::factory()->create();
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course', 'required' => true]);
        $this->mock(NotificationService::class, fn ($mock) => $mock->shouldReceive('notifyCoursePublished')->andReturn(0));
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/courses/{$course->id}/builder/publish")->assertStatus(422);
        $this->assertNotSame('published', $test->fresh()->status);
        $this->assertSame(0, $test->questions()->count());
    }

    public function test_submission_hides_solutions_when_review_is_disabled(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create([
            'show_correct_answers' => false, 'show_results_immediately' => false,
            'show_only_submitted_answers' => true, 'allow_review' => false,
        ]);
        $q = Question::factory()->create(['test_id' => $test->id]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $review = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 1],
        ])->assertOk()->json('result.review_questions.0');
        $this->assertArrayNotHasKey('correct_answer_indices', $review ?? []);
    }

    public function test_submission_after_time_limit_is_rejected(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => 1]);
        $q = Question::factory()->create(['test_id' => $test->id]);
        $attemptId = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->json('active_attempt.id');
        \App\Models\TestResult::where('id', $attemptId)->update([
            'expires_at' => now()->subHour(),
            'started_at' => now()->subHour(),
        ]);
        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 0],
            'attempt_id' => $attemptId,
        ])->assertForbidden()->assertJsonPath('time_expired', true);
    }
    public function test_guest_does_not_receive_restricted_event_links(): void
    {
        $event = $this->event();
        $payload = $this->getJson("/api/events/{$event->id}")->assertOk()->json();
        $this->assertTrue(empty($payload['live_link']));
        $this->assertTrue(empty($payload['replay_url']));
    }
    public function test_root_lesson_is_not_blocked_by_another_course(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $otherCourse = Course::factory()->published()->create();
        $this->lesson($otherCourse)->update(['order' => 0, 'status' => 'published']);
        $course = Course::factory()->published()->create(['sequential_unlock' => true]);
        $first = $this->lesson($course);
        $first->update(['order' => 1, 'status' => 'published']);
        $this->assertTrue(app(\App\Services\ProgressionEngine::class)->isLessonUnlocked($student, $first, $course));
    }

    public function test_manual_review_uses_test_passing_score(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['passing_score' => 90]);
        $q = Question::factory()->create(['test_id' => $test->id, 'type' => 'essay', 'points' => 10, 'answers' => []]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $result = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 'Essay'],
        ])->assertOk()->json('result.id');
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/test-results/{$result}/manual-review", [
            'manual_review_scores' => [['question_id' => $q->id, 'score' => 8]],
        ])->assertOk()->assertJsonPath('result.passed', false);
    }

    public function test_duplicate_manual_scores_cannot_exceed_100_percent(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create();
        $q = Question::factory()->create(['test_id' => $test->id, 'type' => 'essay', 'points' => 10, 'answers' => []]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $result = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 'Essay'],
        ])->assertOk()->json('result.id');
        $percentage = $this->actingAs($admin, 'sanctum')->postJson("/api/admin/test-results/{$result}/manual-review", [
            'manual_review_scores' => [
                ['question_id' => $q->id, 'score' => 10], ['question_id' => $q->id, 'score' => 10],
            ],
        ])->assertOk()->json('result.percentage');
        $this->assertSame(100.0, (float) $percentage);
    }

    public function test_clone_keeps_root_lessons(): void
    {
        $course = Course::factory()->create();
        $this->lesson($course);
        $clone = app(CourseBuilderService::class)->cloneCourse($course->id, null, false);
        $this->assertSame(1, $clone->lessons()->count());
    }

    public function test_locked_test_cannot_be_submitted_directly(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $first = Test::factory()->published()->create();
        $second = Test::factory()->published()->create();
        CourseTest::create(['course_id' => $course->id, 'test_id' => $first->id, 'scope' => 'course', 'order' => 0]);
        CourseTest::create(['course_id' => $course->id, 'test_id' => $second->id, 'scope' => 'course', 'order' => 1, 'unlock_after_test_id' => $first->id]);
        $q = Question::factory()->create(['test_id' => $second->id]);
        $this->assertFalse(app(\App\Services\ProgressionEngine::class)->isTestUnlocked($student, $second, $course));
        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$second->id}/submit?course_id={$course->id}", [
            'answers' => [$q->id => 0],
        ])->assertForbidden();
    }

    public function test_draft_unassigned_lesson_rejects_progress_updates(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->create();
        $lesson = $this->lesson($course);
        $this->actingAs($student, 'sanctum')->putJson("/api/lessons/{$lesson->id}/progress", [
            'progress_percentage' => 50, 'time_spent_seconds' => 36000,
        ])->assertForbidden();
        $this->assertDatabaseMissing('lesson_progress', ['lesson_id' => $lesson->id, 'user_id' => $student->id]);
    }

    public function test_exam_attempt_snapshot_survives_question_edits(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        $q = Question::factory()->create(['test_id' => $test->id, 'content' => 'Original prompt']);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 0],
        ])->assertOk();
        $q->update(['content' => 'Edited after submit']);
        $questions = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk()->json('questions');
        $prompts = collect($questions)->pluck('text')->filter()->all();
        $this->assertContains('Original prompt', $prompts);
        $this->assertNotContains('Edited after submit', $prompts);
    }

    public function test_resubmitting_the_same_attempt_is_idempotent(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        $q = Question::factory()->create(['test_id' => $test->id]);
        $attemptId = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->json('active_attempt.id');
        $first = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 0],
            'attempt_id' => $attemptId,
        ])->assertOk()->json('result.id');
        $second = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$q->id => 0],
            'attempt_id' => $attemptId,
        ])->assertOk()->json('result.id');
        $this->assertSame($first, $second);
        $this->assertSame(1, \App\Models\TestResult::where('test_id', $test->id)->where('user_id', $student->id)->where('status', '!=', 'in_progress')->count());
    }

    public function test_unpublished_builder_edits_do_not_change_live_lessons(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->create(['status' => 'published', 'workflow_status' => 'published']);
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Live title',
            'content' => 'Live content', 'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        app(CourseBuilderService::class)->createCourseVersionSnapshot($course->id, null, 'published');
        app(CourseBuilderService::class)->updateLesson($lesson, [
            'title' => 'Draft title',
            'content' => 'Draft content',
        ]);
        $this->assertSame('editing', $course->fresh()->workflow_status);
        \Illuminate\Support\Facades\DB::table('course_user')->insert([
            'user_id' => $student->id,
            'course_id' => $course->id,
            'enrolled' => true,
            'enrolled_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->actingAs($student, 'sanctum')->getJson("/api/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('title', 'Live title')
            ->assertJsonPath('content', 'Live content');
        $this->actingAs($student, 'sanctum')->getJson("/api/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('lessons.0.title', 'Live title');
    }

    public function test_settings_import_restores_tests_and_events(): void
    {
        $this->markTestSkipped('Formely: importul de backup afectează toată platforma și e blocat pentru academii (vezi TenantPlatformActionsTest).');

        $admin = User::factory()->create(['role' => 'admin']);
        $payload = [
            'export_date' => now()->toISOString(),
            'settings' => [],
            'users' => [],
            'courses' => [],
            'teams' => [],
            'tests' => [[
                'id' => 9101,
                'title' => 'Imported test',
                'status' => 'published',
                'type' => 'quiz',
                'questions' => [[
                    'id' => 9102,
                    'content' => 'Imported question',
                    'type' => 'multiple_choice',
                    'answers' => [['text' => 'A', 'is_correct' => true]],
                    'points' => 1,
                    'order' => 0,
                ]],
            ]],
            'events' => [[
                'id' => 9103,
                'title' => 'Imported event',
                'description' => 'Imported description',
                'type' => 'webinar',
                'status' => 'published',
                'start_date' => now()->addDay()->format('Y-m-d H:i:s'),
                'end_date' => now()->addDays(2)->format('Y-m-d H:i:s'),
                'access_type' => 'free',
            ]],
        ];
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('backup.json', json_encode($payload));
        $this->actingAs($admin, 'sanctum')->post('/api/admin/import', [
            'backup_file' => $file,
        ], ['Accept' => 'application/json'])->assertOk();
        $this->assertDatabaseHas('tests', ['id' => 9101, 'title' => 'Imported test']);
        $this->assertDatabaseHas('questions', ['id' => 9102, 'content' => 'Imported question']);
        $this->assertDatabaseHas('events', ['id' => 9103, 'title' => 'Imported event']);
    }

    public function test_expired_attempt_is_closed_and_a_new_one_can_start(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => 1, 'max_attempts' => 3]);
        Question::factory()->create(['test_id' => $test->id]);
        $firstId = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->json('active_attempt.id');
        \App\Models\TestResult::where('id', $firstId)->update([
            'expires_at' => now()->subMinutes(10),
        ]);
        $secondId = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")
            ->assertOk()
            ->json('active_attempt.id');
        $this->assertNotSame($firstId, $secondId);
        $this->assertDatabaseHas('test_results', ['id' => $firstId, 'status' => 'expired']);
    }

    public function test_course_linked_test_requires_enrollment(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create();
        $test = Test::factory()->published()->create();
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course']);
        Question::factory()->create(['test_id' => $test->id]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}?course_id={$course->id}")
            ->assertForbidden()
            ->assertJsonPath('not_enrolled', true);
    }
    public function test_guest_cannot_read_non_preview_lesson_body(): void
    {
        $course = Course::factory()->published()->create();
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Paid lesson',
            'content' => 'Secret body', 'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        $this->getJson("/api/lessons/{$lesson->id}")->assertForbidden();
        $this->getJson("/api/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('lessons.0.title', 'Paid lesson')
            ->assertJsonPath('lessons.0.content', null);
    }

    public function test_locked_lesson_progress_cannot_auto_complete(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => true]);
        $first = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'First',
            'content' => 'A', 'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        $second = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Second',
            'content' => 'B', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        \Illuminate\Support\Facades\DB::table('course_user')->insert([
            'user_id' => $student->id, 'course_id' => $course->id, 'enrolled' => true,
            'enrolled_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($student, 'sanctum')->putJson("/api/lessons/{$second->id}/progress", [
            'progress_percentage' => 100,
        ])->assertForbidden();
        $this->assertDatabaseMissing('lesson_progress', ['lesson_id' => $second->id, 'user_id' => $student->id]);
        unset($first);
    }

    public function test_attach_test_preserves_optional_required_flag(): void
    {
        $course = Course::factory()->create();
        $test = Test::factory()->create();
        $link = app(CourseBuilderService::class)->attachTest($course, $test, ['required' => false, 'scope' => 'course']);
        $this->assertFalse((bool) $link->required);
    }

    public function test_clone_does_not_share_attached_tests(): void
    {
        $course = Course::factory()->create();
        $this->lesson($course);
        $test = Test::factory()->create(['title' => 'Source test']);
        Question::factory()->create(['test_id' => $test->id, 'content' => 'Q1']);
        CourseTest::create(['course_id' => $course->id, 'test_id' => $test->id, 'scope' => 'course', 'required' => true]);
        $clone = app(CourseBuilderService::class)->cloneCourse($course->id, null, false);
        $clonedLink = CourseTest::where('course_id', $clone->id)->first();
        $this->assertNotNull($clonedLink);
        $this->assertNotSame($test->id, (int) $clonedLink->test_id);
        $this->assertSame(1, Test::find($clonedLink->test_id)?->questions()->count());
    }

    public function test_locked_lesson_body_is_hidden_from_enrolled_student(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->published()->create(['sequential_unlock' => true]);
        $first = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'First',
            'content' => 'A', 'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        $second = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Second',
            'content' => 'Secret', 'type' => 'text', 'status' => 'published', 'order' => 1,
        ]));
        \Illuminate\Support\Facades\DB::table('course_user')->insert([
            'user_id' => $student->id, 'course_id' => $course->id, 'enrolled' => true,
            'enrolled_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($student, 'sanctum')->getJson("/api/lessons/{$second->id}")
            ->assertForbidden()
            ->assertJsonPath('locked', true);
        unset($first);
    }

    public function test_editing_course_hides_new_tests_and_keeps_deleted_lessons(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $course = Course::factory()->create([
            'status' => 'published',
            'workflow_status' => 'published',
            'title' => 'Live course',
        ]);
        $lesson = Lesson::withoutEvents(fn () => Lesson::create([
            'course_id' => $course->id, 'module_id' => null, 'title' => 'Live title',
            'content' => 'Live content', 'type' => 'text', 'status' => 'published', 'order' => 0,
        ]));
        $liveTest = Test::factory()->create(['status' => 'published', 'title' => 'Live exam']);
        CourseTest::create([
            'course_id' => $course->id,
            'test_id' => $liveTest->id,
            'scope' => 'course',
            'required' => false,
        ]);
        app(CourseBuilderService::class)->createCourseVersionSnapshot($course->id, null, 'published');
        $secretTest = Test::factory()->create(['status' => 'published', 'title' => 'Secret exam']);
        app(CourseBuilderService::class)->attachTest($course, $secretTest, ['required' => false, 'scope' => 'course']);
        app(CourseBuilderService::class)->updateCourse($course, ['title' => 'Draft course']);
        $lesson->delete();
        \Illuminate\Support\Facades\DB::table('course_user')->insert([
            'user_id' => $student->id, 'course_id' => $course->id, 'enrolled' => true,
            'enrolled_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $payload = $this->actingAs($student, 'sanctum')->getJson("/api/courses/{$course->id}")
            ->assertOk()
            ->json();
        $this->assertSame('Live course', $payload['title']);
        $this->assertSame('Live title', $payload['lessons'][0]['title'] ?? null);
        $examTitles = collect($payload['exams'] ?? [])->pluck('title');
        $this->assertTrue($examTitles->contains('Live exam'));
        $this->assertFalse($examTitles->contains('Secret exam'));
        $this->actingAs($student, 'sanctum')
            ->getJson("/api/exams/{$secretTest->id}?course_id={$course->id}")
            ->assertForbidden();
    }

    public function test_exam_result_keeps_bank_question_snapshot_after_bank_edit(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $bank = \App\Models\QuestionBank::create([
            'title' => 'Bancă journey',
            'status' => 'published',
            'created_by' => $student->id,
        ]);
        $question = Question::factory()->forQuestionBank($bank->id)->create(['content' => 'Original bank prompt']);
        $test = Test::factory()->published()->withQuestionBank($bank->id)->create([
            'time_limit_minutes' => null,
            'max_attempts' => 3,
        ]);
        $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk();
        $resultId = $this->actingAs($student, 'sanctum')->postJson("/api/exams/{$test->id}/submit", [
            'answers' => [$question->id => 0],
        ])->assertOk()->json('result.id');
        $question->update(['content' => 'Edited bank prompt']);
        $texts = collect($this->actingAs($student, 'sanctum')
            ->getJson("/api/exam-results/{$resultId}?type=test")
            ->assertOk()
            ->json('exam.questions'))
            ->pluck('question_text');
        $this->assertTrue($texts->contains('Original bank prompt'));
        $this->assertFalse($texts->contains('Edited bank prompt'));
    }

    public function test_reopening_exam_reuses_the_same_in_progress_attempt(): void
    {
        $student = User::factory()->create(['role' => 'student']);
        $test = Test::factory()->published()->create(['time_limit_minutes' => null, 'max_attempts' => 3]);
        Question::factory()->create(['test_id' => $test->id]);
        $first = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk()->json('active_attempt.id');
        $second = $this->actingAs($student, 'sanctum')->getJson("/api/exams/{$test->id}")->assertOk()->json('active_attempt.id');
        $this->assertSame($first, $second);
        $this->assertSame(1, \App\Models\TestResult::where('test_id', $test->id)->where('user_id', $student->id)->where('status', 'in_progress')->count());
    }
}
