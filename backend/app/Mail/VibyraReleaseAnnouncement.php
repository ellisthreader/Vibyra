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
            subject: "Vibyra {$this->version} is here — report bugs from your workspace",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.vibyra-release-announcement',
            with: [
                'downloadUrl' => 'https://vibyra-production.up.railway.app/downloads',
                'reportImageUrl' => 'https://vibyra-production.up.railway.app/media/releases/vibyra-0.1.7-report.png',
                'workspaceImageUrl' => 'https://vibyra-production.up.railway.app/media/homepage/desktop-multi-terminal.png',
            ],
        );
    }
}
