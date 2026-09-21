<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Notifications\Messages\MailMessage;

class ResetPassword extends ResetPasswordNotification
{
    protected function resetUrl($notifiable): string
    {
        $base = rtrim((string) config('formely.lms_url', config('formely.frontend_url', 'http://localhost:5173')), '/');
        $query = http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);

        return $base . '/reset-password?' . $query;
    }

    public function toMail($notifiable): MailMessage
    {
        $expire = (int) config('auth.passwords.users.expire', 60);

        return (new MailMessage)
            ->subject('Resetare parolă Formely')
            ->greeting('Salut!')
            ->line('Am primit o cerere de resetare a parolei pentru contul tău Formely.')
            ->action('Resetează parola', $this->resetUrl($notifiable))
            ->line("Linkul expiră în {$expire} minute.")
            ->line('Dacă nu ai solicitat resetarea parolei, poți ignora acest email.');
    }
}
