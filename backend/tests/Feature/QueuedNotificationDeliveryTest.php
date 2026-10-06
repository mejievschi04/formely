<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Services\EmailNotificationService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class QueuedNotificationDeliveryTest extends TestCase
{

    public function test_email_is_delivered_by_worker_only_after_transaction_commits(): void
    {
        // A dedicated in-memory connection allows a real commit without the suite's wrapping transaction.
        config([
            'database.connections.queue_delivery_test' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'database.default' => 'queue_delivery_test',
            'queue.default' => 'database', 'mail.default' => 'array',
        ]);
        Artisan::call('migrate', ['--force' => true]);
        Setting::set('email_notifications', '1', 'boolean');
        $transport = Mail::mailer('array')->getSymfonyTransport();

        DB::beginTransaction();
        app(EmailNotificationService::class)->sendToRawEmail('queue@example.test', 'Test', 'Mesaj');
        $this->assertDatabaseCount('jobs', 0);
        DB::commit();
        $this->assertDatabaseCount('jobs', 1);
        $this->assertCount(0, $transport->messages());

        Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 1]);
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 0);
        $this->assertCount(1, $transport->messages());
    }
}
