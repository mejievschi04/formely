<?php

namespace App\Services;

use App\Jobs\SendRegistrationInvitationEmailJob;
use App\Models\RegistrationInvitation;
use App\Models\Scopes\CompanyScope;
use App\Models\User;
use App\Support\RegistrationInvitationUrl;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RegistrationInvitationService
{
    /**
     * @return array{invitation: RegistrationInvitation, invite_url: string}
     */
    public function createAndSend(
        string $email,
        User $invitedBy,
        ?string $name = null,
        string $role = 'student',
        ?int $teamId = null,
        int $expiresInDays = 7,
        ?User $existingUser = null,
        ?int $companyId = null
    ): array {
        $email = strtolower(trim($email));
        if ($existingUser) {
            $this->assertUserInvitable($existingUser, $email);
        } else {
            $this->assertEmailAvailable($email);
        }

        // Emailul e unic pe toată platforma, deci și invitațiile în așteptare.
        RegistrationInvitation::withoutGlobalScope(CompanyScope::class)
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->delete();

        [$plainToken, $inviteUrl] = $this->makeTokenPair();
        $emailEnabled = $this->emailNotificationsEnabled($companyId ?? $existingUser?->company_id ?? $invitedBy->company_id);

        $invitation = RegistrationInvitation::create([
            'company_id' => $companyId ?? $existingUser?->company_id ?? $invitedBy->company_id,
            'email' => $email,
            'user_id' => $existingUser?->id,
            'token' => hash('sha256', $plainToken),
            'encrypted_token' => Crypt::encryptString($plainToken),
            'name' => $name ? strip_tags(trim($name)) : null,
            'role' => $role,
            'team_id' => $teamId,
            'invited_by' => $invitedBy->id,
            'expires_at' => now()->addDays($expiresInDays),
            'email_status' => $emailEnabled ? 'pending' : 'skipped',
        ]);

        if ($emailEnabled) {
            $this->queueInvitationEmail($invitation, $plainToken, $invitedBy);
        }

        Log::info('Registration invitation created', [
            'invitation_id' => $invitation->id,
            'email' => $email,
            'invited_by' => $invitedBy->id,
        ]);

        return [
            'invitation' => $invitation,
            'invite_url' => $inviteUrl,
        ];
    }

    /**
     * @return array{invitation: RegistrationInvitation, invite_url: string}
     */
    public function resendEmail(RegistrationInvitation $invitation, User $invitedBy): array
    {
        $this->assertInvitationActive($invitation);
        if ($invitation->user_id) {
            $this->assertUserInvitable($invitation->user, $invitation->email);
        } else {
            $this->assertEmailAvailable($invitation->email);
        }

        [$plainToken, $inviteUrl] = $this->rotateToken($invitation, $invitedBy);
        $emailEnabled = $this->emailNotificationsEnabled($invitation->company_id);

        $invitation->update([
            'email_status' => $emailEnabled ? 'pending' : 'skipped',
            'email_sent_at' => null,
            'email_last_error' => null,
            'reminder_sent_at' => null,
        ]);

        $invitation = $invitation->fresh();

        if ($emailEnabled) {
            $this->queueInvitationEmail($invitation, $plainToken, $invitedBy);
        }

        return [
            'invitation' => $invitation,
            'invite_url' => $inviteUrl,
        ];
    }

    public function getInviteUrl(RegistrationInvitation $invitation): string
    {
        $this->assertInvitationActive($invitation);

        if (empty($invitation->encrypted_token)) {
            throw ValidationException::withMessages([
                'invitation' => ['Linkul nu este disponibil. Retrimite invitația pe email.'],
            ]);
        }

        $plainToken = Crypt::decryptString($invitation->encrypted_token);

        return RegistrationInvitationUrl::build($plainToken);
    }

    public function queueExpiryReminders(): int
    {
        if (! $this->emailNotificationsEnabled()) {
            return 0;
        }

        $query = RegistrationInvitation::query()
            ->whereNull('accepted_at')
            ->whereNotNull('encrypted_token')
            ->where('expires_at', '>', now())
            ->where('expires_at', '<=', now()->addHours(48));

        if (\App\Support\SchemaCache::hasColumn('registration_invitations', 'reminder_sent_at')) {
            $query->whereNull('reminder_sent_at');
        }

        $sent = 0;
        $query->with('inviter:id,name')->each(function (RegistrationInvitation $invitation) use (&$sent) {
            if (! $this->emailNotificationsEnabled($invitation->company_id)) {
                return;
            }
            try {
                $plainToken = Crypt::decryptString($invitation->encrypted_token);
            } catch (\Throwable) {
                return;
            }

            $secondsLeft = max(1, $invitation->expires_at->getTimestamp() - now()->getTimestamp());
            SendRegistrationInvitationEmailJob::dispatch(
                $invitation->id,
                $plainToken,
                $invitation->inviter?->name ?: 'Administrator',
                max(1, (int) ceil($secondsLeft / 86400)),
                true,
            )->afterCommit();
            $sent++;
        });

        return $sent;
    }

    public function findPendingByPlainToken(string $plainToken): ?RegistrationInvitation
    {
        if ($plainToken === '') {
            return null;
        }

        return RegistrationInvitation::withoutGlobalScope(CompanyScope::class)
            ->where('token', hash('sha256', $plainToken))
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->first();
    }

    public function assertUserInvitable(?User $user, string $email): void
    {
        if (! $user || $user->last_login_at !== null
            || ($user->status ?? 'active') !== 'active'
            || strtolower($user->email) !== strtolower($email)) {
            throw ValidationException::withMessages([
                'user' => ['Invitația este disponibilă doar pentru conturi active care încă nu au accesat Academy.'],
            ]);
        }
    }

    private function assertEmailAvailable(string $email): void
    {
        if (User::withoutGlobalScope(CompanyScope::class)->where('email', $email)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['Există deja un cont cu acest email.'],
            ]);
        }
    }

    private function assertInvitationActive(RegistrationInvitation $invitation): void
    {
        if ($invitation->isAccepted()) {
            throw ValidationException::withMessages([
                'invitation' => ['Invitația a fost deja folosită.'],
            ]);
        }

        if ($invitation->isExpired()) {
            throw ValidationException::withMessages([
                'invitation' => ['Invitația a expirat. Creează una nouă.'],
            ]);
        }
    }

    /**
     * @return array{0: string, 1: string} plain token + public url
     */
    private function makeTokenPair(): array
    {
        $plainToken = Str::random(64);

        return [$plainToken, RegistrationInvitationUrl::build($plainToken)];
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function rotateToken(RegistrationInvitation $invitation, User $invitedBy): array
    {
        [$plainToken, $inviteUrl] = $this->makeTokenPair();

        $invitation->update([
            'token' => hash('sha256', $plainToken),
            'encrypted_token' => Crypt::encryptString($plainToken),
            'expires_at' => now()->addDays(7),
            'invited_by' => $invitedBy->id,
        ]);

        return [$plainToken, $inviteUrl];
    }

    private function emailNotificationsEnabled(?int $companyId = null): bool
    {
        return app(EmailNotificationService::class)->isEnabledForCompany($companyId);
    }

    private function queueInvitationEmail(
        RegistrationInvitation $invitation,
        string $plainToken,
        User $invitedBy
    ): void {
        SendRegistrationInvitationEmailJob::dispatch(
            $invitation->id,
            $plainToken,
            $invitedBy->name ?: 'Administrator',
        )->afterCommit();
    }
}
