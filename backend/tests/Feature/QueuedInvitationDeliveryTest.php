<?php

namespace Tests\Feature;

use App\Jobs\SendRegistrationInvitationEmailJob;
use App\Mail\RegistrationInvitationMail;
use App\Models\Setting;
use App\Models\User;
use App\Services\RegistrationInvitationService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class QueuedInvitationDeliveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.connections.invitation_delivery_test' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'database.default' => 'invitation_delivery_test',
            'queue.default' => 'database', 'mail.default' => 'array',
            'queue.failed.database' => 'invitation_delivery_test',
        ]);
        Artisan::call('migrate', ['--force' => true]);
        Setting::set('email_notifications', '1', 'boolean');
    }

    public function test_invitation_is_queued_after_commit_and_delivered_by_worker(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $transport = Mail::mailer('array')->getSymfonyTransport();
        DB::beginTransaction();
        $result = app(RegistrationInvitationService::class)->createAndSend('invitat@example.test', $admin, 'Ștefan Țîrlea');
        $this->assertDatabaseCount('jobs', 0);
        DB::commit();
        $this->assertDatabaseCount('jobs', 1);
        $this->assertCount(0, $transport->messages());
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 3]);
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 0);
        $this->assertCount(1, $transport->messages());
        $this->assertSame('sent', $result['invitation']->fresh()->email_status);
        $message = $transport->messages()->first()->getOriginalMessage();
        $this->assertStringContainsString($result['invite_url'], $message->getHtmlBody());
        $this->assertSame('invitat@example.test', $message->getTo()[0]->getAddress());
    }

    public function test_resend_does_not_deliver_old_token_or_allow_old_failure_to_override_status(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $service = app(RegistrationInvitationService::class);
        $original = $service->createAndSend('resend@example.test', $admin);
        $oldToken = basename($original['invite_url']);
        $resent = $service->resendEmail($original['invitation'], $admin);
        $this->assertNotSame($original['invite_url'], $resent['invite_url']);
        $this->assertDatabaseCount('jobs', 2);
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true]);
        Mail::assertNothingSent();
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true]);
        Mail::assertSent(RegistrationInvitationMail::class, 1);
        (new SendRegistrationInvitationEmailJob($original['invitation']->id, $oldToken, $admin->name))
            ->failed(new \RuntimeException('Old attempt'));
        $this->assertSame('sent', $resent['invitation']->fresh()->email_status);
    }

    public function test_transport_failure_is_retried_and_terminal_failure_is_reported(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $result = app(RegistrationInvitationService::class)->createAndSend('retry@example.test', $admin);
        Mail::shouldReceive('to')->andReturnSelf();
        Mail::shouldReceive('send')->andThrow(new \RuntimeException('SMTP unavailable'));
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 3]);
        $this->assertDatabaseCount('jobs', 1);
        $this->assertSame(1, DB::table('jobs')->value('attempts'));
        $this->assertSame('pending', $result['invitation']->fresh()->email_status);
        $this->assertDatabaseCount('failed_jobs', 0);
        for ($attempt = 2; $attempt <= 3; $attempt++) {
            DB::table('jobs')->update(['available_at' => now()->timestamp]);
            Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 3]);
        }
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 1);
        $this->assertSame('failed', $result['invitation']->fresh()->email_status);
    }
}
