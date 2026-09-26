<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The phone cannot install anything on a computer, so it emails the person a link
 * to open there instead. The link is the public downloads page; it carries no
 * pairing material, so forwarding it grants nothing.
 */
class HostDownloadLink extends Notification
{
    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Install Vibyra on your computer')
            ->line('Open this link on the computer you want to use from your phone.')
            ->action('Download Vibyra', url('/downloads'))
            ->line('Once it is running, open Remote in the Vibyra app and it will find your computer.')
            ->line('This link only opens the download page. It does not connect anything on its own.');
    }
}
