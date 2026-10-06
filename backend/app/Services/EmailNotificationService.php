<?php

namespace App\Services;

use App\Mail\VoltaUserNotificationMail;
use App\Models\Company;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class EmailNotificationService
{
    public function isEnabled(): bool
    {
        return (bool) Setting::get('email_notifications', true);
    }

    /** Formely: comutatorul platformei și cel al academiei trebuie să fie ambele pornite. */
    public function isEnabledForCompany(?int $companyId): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }
        if (! $companyId) {
            return true;
        }

        return (bool) (Company::query()->whereKey($companyId)->value('email_notifications') ?? true);
    }

    /**
     * Conturile fără status sunt tratate ca active, la fel ca la autentificare.
     */
    public function isActiveUser(User $user): bool
    {
        return (string) ($user->status ?? 'active') === 'active';
    }

    public function absoluteUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $base = config('volta.frontend_url', 'http://localhost:5173');

        return $base . (str_starts_with($path, '/') ? $path : '/' . $path);
    }

    /**
     * Send to an email address (e.g. before the user account exists).
     */
    public function sendToRawEmail(
        string $email,
        string $subject,
        string $body,
        ?string $actionPath = null,
        string $actionLabel = 'Deschide în platformă'
    ): void {
        if (! $this->isEnabled()) {
            return;
        }

        $email = trim($email);
        if ($email === '') {
            return;
        }

        try {
            Mail::to($email)->queue(new VoltaUserNotificationMail(
                heading: $subject,
                body: $body,
                actionUrl: $this->absoluteUrl($actionPath),
                actionLabel: $actionLabel,
            ));
        } catch (\Throwable $e) {
            Log::warning('EmailNotificationService::sendToRawEmail failed', [
                'email' => $email,
                'subject' => $subject,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Send a notification email to one user (no-op if disabled or no email).
     */
    public function sendToUser(
        User $user,
        string $subject,
        string $body,
        ?string $actionPath = null,
        string $actionLabel = 'Deschide în platformă'
    ): void {
        if (! $this->isEnabled()) {
            return;
        }

        $email = trim((string) ($user->email ?? ''));
        if ($email === '' || ! $this->isActiveUser($user)) {
            return;
        }

        if (! $this->isEnabledForCompany($user->company_id ? (int) $user->company_id : null)) {
            return;
        }

        try {
            Mail::to($email)->queue(new VoltaUserNotificationMail(
                heading: $subject,
                body: $body,
                actionUrl: $this->absoluteUrl($actionPath),
                actionLabel: $actionLabel,
            ));
        } catch (\Throwable $e) {
            Log::warning('EmailNotificationService::sendToUser failed', [
                'user_id' => $user->id,
                'email' => $email,
                'subject' => $subject,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @param  iterable<int, User|int>  $usersOrIds
     */
    public function sendToMany(
        iterable $usersOrIds,
        string $subject,
        string $body,
        ?string $actionPath = null,
        string $actionLabel = 'Deschide în platformă'
    ): void {
        if (! $this->isEnabled()) {
            return;
        }

        $items = collect($usersOrIds);
        $users = $items->filter(fn ($item) => $item instanceof User);
        $ids = $items->reject(fn ($item) => $item instanceof User)->map(fn ($id) => (int) $id);
        if ($ids->isNotEmpty()) {
            $users = $users->concat(User::query()->whereIn('id', $ids)->get());
        }
        $users = $users->unique('id');

        foreach ($users as $user) {
            $this->sendToUser($user, $subject, $body, $actionPath, $actionLabel);
        }
    }
}
