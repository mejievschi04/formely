<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RegistrationInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $inviterName,
        public string $recipientEmail,
        public string $registerUrl,
        public ?string $recipientName = null,
        public int $expiresInDays = 7,
        public bool $isReminder = false,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->isReminder
                ? 'Reminder: invitația Formely expiră curând'
                : 'Invitație Formely — activează-ți contul',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.registration-invitation',
        );
    }
}
