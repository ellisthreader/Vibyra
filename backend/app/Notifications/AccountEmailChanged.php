<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent to the old address when an account's email changes, so a takeover
 * that swaps the email cannot happen silently.
 */
class AccountEmailChanged extends Notification
{
    public function __construct(private readonly string $newEmail) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Vibyra email was changed')
            ->line('The email on your Vibyra account was just changed to '.$this->newEmail.'.')
            ->line('If you did this, there is nothing else to do.')
            ->line('If you did not, reply to this email or contact support@vibyra.app straight away so we can lock the account.');
    }
}
