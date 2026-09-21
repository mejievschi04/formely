<?php

namespace App\Services;

use App\Mail\UserNotificationMail;
use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\User;
use App\Models\UserInvitation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UserInvitationService
{
    public function __construct(
        private readonly EmailNotificationService $emailNotificationService,
        private readonly PlanEntitlementService $entitlements,
    ) {}

    public function expiryDays(): int
    {
        return (int) config('formely.invitation_expire_days', 7);
    }

    /**
     * @return array{invitation: UserInvitation, invite_url: string}
     */
    public function createAndSend(
        string $email,
        User $inviter,
        ?string $name,
        string $role,
        ?int $teamId,
        Request $request
    ): array {
        $invitation = $this->createOrRefreshInvitation($email, $name, $role, $teamId, $inviter);
        $plainToken = $invitation->runtimePlainToken;
        $inviteUrl = $this->acceptUrl($plainToken);

        $this->dispatchInvitationEmail($invitation, $plainToken);
        $this->logInvited($inviter, $invitation, $request);

        return [
            'invitation' => $invitation->fresh(['inviter:id,name,email', 'team:id,name']),
            'invite_url' => $inviteUrl,
        ];
    }

    public function getInviteUrl(UserInvitation $invitation): string
    {
        if ($invitation->accepted_at !== null) {
            throw ValidationException::withMessages([
                'invitation' => ['Invitația a fost deja acceptată.'],
            ]);
        }

        if ($invitation->isExpired()) {
            throw ValidationException::withMessages([
                'invitation' => ['Invitația a expirat. Retrimite invitația.'],
            ]);
        }

        $plainToken = $invitation->plainToken();
        if (! $plainToken) {
            throw ValidationException::withMessages([
                'invitation' => ['Linkul nu este disponibil. Retrimite invitația pe email.'],
            ]);
        }

        return $this->acceptUrl($plainToken);
    }

    /**
     * @param  array<int, array{email: string, name?: string|null}>  $entries
     * @return array{sent: array<int, array<string, mixed>>, failed: array<int, array<string, mixed>>}
     */
    public function sendMany(
        array $entries,
        string $role,
        ?int $teamId,
        User $inviter,
        Request $request
    ): array {
        $sent = [];
        $failed = [];

        foreach ($entries as $entry) {
            $email = strtolower(trim($entry['email'] ?? ''));
            if ($email === '') {
                continue;
            }

            $name = isset($entry['name']) ? strip_tags(trim((string) $entry['name'])) : null;
            if ($name === '') {
                $name = null;
            }

            try {
                $invitation = $this->createOrRefreshInvitation($email, $name, $role, $teamId, $inviter);
                $plainToken = $invitation->runtimePlainToken;
                $this->dispatchInvitationEmail($invitation, $plainToken);
                $this->logInvited($inviter, $invitation, $request);

                $sent[] = [
                    'id' => $invitation->id,
                    'email' => $invitation->email,
                    'name' => $invitation->name,
                    'role' => $invitation->role,
                    'expires_at' => $invitation->expires_at->toIso8601String(),
                ];
            } catch (ValidationException $e) {
                $failed[] = [
                    'email' => $email,
                    'message' => collect($e->errors())->flatten()->first() ?? $e->getMessage(),
                ];
            } catch (\Throwable $e) {
                Log::warning('UserInvitationService::sendMany failed', [
                    'email' => $email,
                    'error' => $e->getMessage(),
                ]);
                $failed[] = [
                    'email' => $email,
                    'message' => 'Nu am putut trimite invitația.',
                ];
            }
        }

        return ['sent' => $sent, 'failed' => $failed];
    }

    public function createOrRefreshInvitation(
        string $email,
        ?string $name,
        string $role,
        ?int $teamId,
        User $inviter
    ): UserInvitation {
        $email = strtolower(trim($email));

        if (User::withoutGlobalScopes()->where('email', $email)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['Există deja un cont cu acest email.'],
            ]);
        }

        $plainToken = Str::random(64);
        $companyId = $inviter->company_id ?: \App\Support\TenantContext::companyId();

        if (! $companyId) {
            throw ValidationException::withMessages([
                'email' => ['Invitația nu are o academie asociată.'],
            ]);
        }

        $existing = UserInvitation::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->first();

        if ($existing) {
            $existing->fill([
                'company_id' => $companyId ?? $existing->company_id,
                'name' => $name ?? $existing->name,
                'role' => $role,
                'team_id' => $teamId,
                'token' => Hash::make($plainToken),
                'encrypted_token' => Crypt::encryptString($plainToken),
                'invited_by' => $inviter->id,
                'expires_at' => now()->addDays($this->expiryDays()),
                'email_status' => $this->emailNotificationsEnabled() ? 'pending' : 'skipped',
                'email_sent_at' => null,
                'email_last_error' => null,
            ])->save();

            $existing->runtimePlainToken = $plainToken;

            return $existing;
        }

        $invitation = UserInvitation::create([
            'company_id' => $companyId,
            'email' => $email,
            'name' => $name,
            'role' => $role,
            'team_id' => $teamId,
            'token' => Hash::make($plainToken),
            'encrypted_token' => Crypt::encryptString($plainToken),
            'invited_by' => $inviter->id,
            'expires_at' => now()->addDays($this->expiryDays()),
            'email_status' => $this->emailNotificationsEnabled() ? 'pending' : 'skipped',
        ]);

        $invitation->runtimePlainToken = $plainToken;

        return $invitation;
    }

    public function sendInvitationEmail(UserInvitation $invitation, string $plainToken): void
    {
        $invitation->loadMissing('inviter:id,name');

        if (! $this->emailNotificationsEnabled()) {
            $invitation->forceFill([
                'email_status' => 'skipped',
                'email_last_error' => null,
            ])->save();

            return;
        }

        $acceptUrl = $this->acceptUrl($plainToken);
        $inviterName = $invitation->inviter?->name ?? 'Administrator';
        $expireDays = $this->expiryDays();

        Mail::to($invitation->email)->send(new UserNotificationMail(
            heading: 'Invitație Formely',
            body: "{$inviterName} te invită să te alături platformei Formely. Acceptă invitația pentru a-ți crea contul. Linkul expiră în {$expireDays} zile.",
            actionUrl: $acceptUrl,
            actionLabel: 'Acceptă invitația',
        ));

        $invitation->forceFill([
            'email_status' => 'sent',
            'email_sent_at' => now(),
            'email_last_error' => null,
        ])->save();
    }

    protected function dispatchInvitationEmail(UserInvitation $invitation, string $plainToken): void
    {
        try {
            $this->sendInvitationEmail($invitation, $plainToken);
        } catch (\Throwable $e) {
            $invitation->forceFill([
                'email_status' => 'failed',
                'email_last_error' => $e->getMessage(),
            ])->save();

            throw $e;
        }
    }

    protected function emailNotificationsEnabled(): bool
    {
        return $this->emailNotificationService->isEnabled();
    }

    public function acceptUrl(string $plainToken): string
    {
        $base = rtrim((string) config('formely.lms_url', config('formely.frontend_url', 'http://localhost:5173')), '/');

        return $base . '/accept-invite?' . http_build_query(['token' => $plainToken]);
    }

    public function findValidByPlainToken(string $plainToken): ?UserInvitation
    {
        if ($plainToken === '') {
            return null;
        }

        $candidates = UserInvitation::withoutGlobalScopes()
            ->with(['inviter:id,name', 'team:id,name'])
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->get();

        foreach ($candidates as $invitation) {
            if (Hash::check($plainToken, $invitation->token)) {
                return $invitation;
            }
        }

        return null;
    }

    public function accept(UserInvitation $invitation, string $name, string $password): User
    {
        if ($invitation->accepted_at !== null) {
            throw ValidationException::withMessages([
                'token' => ['Invitația a fost deja acceptată.'],
            ]);
        }

        if ($invitation->isExpired()) {
            throw ValidationException::withMessages([
                'token' => ['Invitația a expirat. Solicită o invitație nouă.'],
            ]);
        }

        if (User::withoutGlobalScopes()->where('email', $invitation->email)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['Există deja un cont cu acest email.'],
            ]);
        }

        $company = $invitation->company_id
            ? Company::withoutGlobalScopes()->find($invitation->company_id)
            : null;
        if (! $company || ! $company->isUsable()) {
            throw ValidationException::withMessages([
                'token' => ['Organizația nu este activă. Invitația nu poate fi acceptată.'],
            ]);
        }

        $this->entitlements->assertSeatAvailable(
            $company,
            (string) $invitation->role,
            1,
            $invitation->id
        );

        $user = User::create([
            'company_id' => $invitation->company_id,
            'name' => strip_tags($name),
            'email' => $invitation->email,
            'password' => Hash::make($password),
            'role' => $invitation->role,
            'status' => 'active',
            'level' => 1,
            'points' => 0,
            'must_change_password' => false,
        ]);

        if ($invitation->team_id) {
            $user->teams()->syncWithoutDetaching([$invitation->team_id]);
        }

        $invitation->forceFill(['accepted_at' => now()])->save();

        if (Schema::hasTable('activity_logs')) {
            ActivityLog::create([
                'user_id' => $invitation->invited_by,
                'action' => 'user_registered',
                'model_type' => 'User',
                'model_id' => $user->id,
                'description' => "{$user->name} a acceptat invitația și și-a creat contul",
                'new_values' => [
                    'email' => $user->email,
                    'role' => $user->role,
                    'invitation_id' => $invitation->id,
                ],
            ]);
        }

        return $user;
    }

    /**
     * @return array{invitation: UserInvitation, invite_url: string}
     */
    public function resend(UserInvitation $invitation, User $inviter, Request $request): array
    {
        if ($invitation->accepted_at !== null) {
            throw ValidationException::withMessages([
                'invitation' => ['Invitația a fost deja acceptată.'],
            ]);
        }

        if (User::withoutGlobalScopes()->where('email', $invitation->email)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['Există deja un cont cu acest email.'],
            ]);
        }

        $plainToken = Str::random(64);
        $invitation->fill([
            'token' => Hash::make($plainToken),
            'encrypted_token' => Crypt::encryptString($plainToken),
            'invited_by' => $inviter->id,
            'expires_at' => now()->addDays($this->expiryDays()),
            'email_status' => $this->emailNotificationsEnabled() ? 'pending' : 'skipped',
            'email_sent_at' => null,
            'email_last_error' => null,
        ])->save();

        $this->dispatchInvitationEmail($invitation, $plainToken);
        $this->logInvited($inviter, $invitation, $request);

        return [
            'invitation' => $invitation->fresh(['inviter:id,name,email', 'team:id,name']),
            'invite_url' => $this->acceptUrl($plainToken),
        ];
    }

    private function logInvited(User $inviter, UserInvitation $invitation, Request $request): void
    {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        ActivityLog::create([
            'user_id' => $inviter->id,
            'action' => 'user_invited',
            'model_type' => 'UserInvitation',
            'model_id' => $invitation->id,
            'description' => "Invitație trimisă către {$invitation->email}",
            'new_values' => [
                'email' => $invitation->email,
                'role' => $invitation->role,
                'team_id' => $invitation->team_id,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }
}
