<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UserNotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $heading,
        public string $body,
        public ?string $actionUrl = null,
        public string $actionLabel = 'Deschide în platformă',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->heading,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.user-notification',
        );
    }
}
