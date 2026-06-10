<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;

class VibyraVerifyEmail extends VerifyEmail
{
    public function toMail($notifiable): MailMessage
    {
        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $notifiable->getKey(), 'hash' => sha1($notifiable->getEmailForVerification())]
        );

        return (new MailMessage)
            ->subject('Verify your Vibyra email')
            ->line('Verify this email address to secure your Vibyra account.')
            ->action('Verify email', $url)
            ->line('This link expires in 60 minutes.');
    }
}
