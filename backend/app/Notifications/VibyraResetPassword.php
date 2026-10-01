<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

class VibyraResetPassword extends ResetPassword
{
    public function toMail($notifiable): MailMessage
    {
        $parameters = [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ];
        $origin = rtrim((string) config('app.url'), '/');
        $legacyUrl = $origin.'/api/auth/password/open?'.http_build_query($parameters);
        $mode = $this->recoveryLinkMode();
        $url = $origin.'/reset-password?'.http_build_query($parameters);

        $message = (new MailMessage)
            ->subject('Reset your Vibyra password')
            ->line('Use the secure link below to choose a new Vibyra password.')
            ->action('Reset password', $url);

        if ($mode === 'dual') {
            $message->line("Using an older Vibyra app? [Open the compatibility reset link]({$legacyUrl}).");
        }

        return $message->line('This link expires in 60 minutes. Ignore this email if you did not request it.');
    }

    private function recoveryLinkMode(): string
    {
        $mode = strtolower(trim((string) config('auth.recovery_links.mode', 'dual')));

        return in_array($mode, ['legacy', 'dual', 'verified'], true) ? $mode : 'dual';
    }

}
