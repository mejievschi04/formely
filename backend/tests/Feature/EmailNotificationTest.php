<?php

namespace Tests\Feature;

use App\Mail\UserNotificationMail;
use App\Models\Course;
use App\Models\Setting;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EmailNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Setting::set('email_notifications', '1', 'boolean', 'Notificări email active');
    }

    public function test_course_enrolled_sends_email_when_enabled(): void
    {
        if (! Schema::hasTable('notifications')) {
            $this->markTestSkipped('notifications table missing');
        }

        $student = User::factory()->create(['role' => 'student', 'email' => 'student@test.local']);
        $course = Course::factory()->published()->create(['title' => 'Laravel Basics']);

        app(NotificationService::class)->notifyCourseEnrolled($student, $course);

        Mail::assertSent(UserNotificationMail::class, function (UserNotificationMail $mail) use ($student) {
            return $mail->hasTo($student->email)
                && str_contains($mail->heading, 'Înscriere');
        });
    }

    public function test_no_email_when_globally_disabled(): void
    {
        if (! Schema::hasTable('notifications')) {
            $this->markTestSkipped('notifications table missing');
        }

        Setting::set('email_notifications', '0', 'boolean', 'Notificări email active');

        $student = User::factory()->create(['role' => 'student', 'email' => 'student2@test.local']);
        $course = Course::factory()->published()->create();

        app(NotificationService::class)->notifyCourseEnrolled($student, $course);

        Mail::assertNothingSent();
    }

    public function test_registration_requested_emails_admins(): void
    {
        if (! Schema::hasTable('notifications')) {
            $this->markTestSkipped('notifications table missing');
        }

        $admin = User::factory()->create(['role' => 'admin', 'email' => 'admin@test.local']);
        $applicant = User::factory()->create(['role' => 'student', 'email' => 'new@test.local']);

        app(NotificationService::class)->notifyRegistrationRequested($applicant);

        Mail::assertSent(UserNotificationMail::class, function (UserNotificationMail $mail) use ($admin) {
            return $mail->hasTo($admin->email);
        });
    }
}
