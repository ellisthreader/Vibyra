<?php

namespace App\Mail;

use App\Models\PublicRequest;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\{Content, Envelope};
use Illuminate\Support\Str;
use Symfony\Component\Mime\Email;

class PublicRequestReceived extends Mailable
{
    public function __construct(public PublicRequest $publicRequest) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New Vibyra request: '.Str::headline($this->publicRequest->topic).' — '.$this->publicRequest->reference,
            // Replace the global support Reply-To instead of appending to it.
            using: [fn (Email $message) => $message->replyTo($this->publicRequest->email)],
        );
    }

    public function content(): Content
    {
        return new Content(text: 'mail.public-request-received');
    }
}
