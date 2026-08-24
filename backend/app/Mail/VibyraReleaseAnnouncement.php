<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class VibyraReleaseAnnouncement extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $firstName,
        public readonly string $version,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "We fixed Vibyra terminal lag — please update to {$this->version}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.vibyra-release-announcement',
            with: [
                'downloadUrl' => 'https://vibyra-production.up.railway.app/downloads',
            ],
        );
    }
}
