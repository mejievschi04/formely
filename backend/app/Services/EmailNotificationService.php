<?php

namespace App\Services;

use App\Mail\UserNotificationMail;
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

    public function absoluteUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $base = config('formely.frontend_url', 'http://localhost:5173');

        return $base . (str_starts_with($path, '/') ? $path : '/' . $path);
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
        if ($email === '') {
            return;
        }

        try {
            Mail::to($email)->send(new UserNotificationMail(
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

        $users = collect($usersOrIds)->map(function ($item) {
            if ($item instanceof User) {
                return $item;
            }

            return User::query()->find((int) $item);
        })->filter();

        foreach ($users as $user) {
            $this->sendToUser($user, $subject, $body, $actionPath, $actionLabel);
        }
    }
}
