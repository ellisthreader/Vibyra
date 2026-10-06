<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class VibyraSecurityCode extends Notification
{
    public function __construct(public readonly string $code) {}
    public function via(object $notifiable): array { return ['mail']; }
    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject('Your Vibyra security code')
            ->line('Your Vibyra security code is: '.$this->code)
            ->line('It expires in five minutes and works once. Never share it.')
            ->line('If you did not request this code, ignore this message.');
    }
}
