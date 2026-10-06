<?php

namespace App\Jobs;

use App\Mail\RegistrationInvitationMail;
use App\Models\RegistrationInvitation;
use App\Support\RegistrationInvitationUrl;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendRegistrationInvitationEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    public int $timeout = 60;

    public function __construct(
        public int $invitationId,
        public string $plainToken,
        public string $inviterName,
        public int $expiresInDays = 7,
        public bool $isReminder = false,
    ) {}

    public function handle(): void
    {
        $invitation = RegistrationInvitation::find($this->invitationId);
        if (! $invitation || $invitation->isAccepted() || $invitation->isExpired()
            || ! hash_equals($invitation->token, hash('sha256', $this->plainToken))) {
            return;
        }

        if (! app(\App\Services\EmailNotificationService::class)->isEnabledForCompany($invitation->company_id)) {
            $this->updateCurrentInvitation([
                'email_status' => 'skipped',
                'email_last_error' => null,
            ]);

            return;
        }

        $registerUrl = RegistrationInvitationUrl::build($this->plainToken);

        try {
            Mail::to($invitation->email)->send(new RegistrationInvitationMail(
                inviterName: $this->inviterName,
                recipientEmail: $invitation->email,
                registerUrl: $registerUrl,
                recipientName: $invitation->name,
                expiresInDays: max(1, $this->expiresInDays),
                isReminder: $this->isReminder,
            ));

            $attributes = [
                'email_last_error' => null,
            ];
            if ($this->isReminder) {
                $attributes['reminder_sent_at'] = now();
            } else {
                $attributes['email_status'] = 'sent';
                $attributes['email_sent_at'] = now();
            }
            $this->updateCurrentInvitation($attributes);
        } catch (\Throwable $e) {
            Log::warning('SendRegistrationInvitationEmailJob failed', [
                'invitation_id' => $invitation->id,
                'email' => $invitation->email,
                'error' => $e->getMessage(),
            ]);

            $this->updateCurrentInvitation([
                'email_status' => 'pending',
                'email_last_error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(?\Throwable $exception): void
    {
        if ($this->isReminder) {
            return;
        }

        $this->updateCurrentInvitation([
            'email_status' => 'failed',
            'email_last_error' => $exception?->getMessage() ?? 'Trimiterea emailului a eșuat.',
        ]);
    }

    private function updateCurrentInvitation(array $attributes): void
    {
        // An older attempt must not overwrite the state of a resent invitation.
        RegistrationInvitation::query()
            ->whereKey($this->invitationId)
            ->where('token', hash('sha256', $this->plainToken))
            ->whereNull('accepted_at')
            ->update($attributes);
    }
}
