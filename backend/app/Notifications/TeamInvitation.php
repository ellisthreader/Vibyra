<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The email for a team invitation. The link carries the secret in the URL fragment (`#token=...`), so it is not sent to the server
 * with the page request, not written to access logs and not passed on in a Referer header. It works only for the invited address.
 */
class TeamInvitation extends Notification
{
    public function __construct(private readonly string $team, private readonly string $inviter, private readonly string $url, private readonly int $days) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('You are invited to join '.$this->team.' on Vibyra')
            ->line($this->inviter.' invited you to join the team "'.$this->team.'" on Vibyra.')
            ->action('Review the invitation', $this->url)
            ->line('Sign in with this email address to accept. The link works once and expires in '.$this->days.' days.')
            ->line('If you were not expecting this, you can ignore the email. Nothing happens unless you accept.');
    }
}
