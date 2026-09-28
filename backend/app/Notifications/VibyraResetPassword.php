<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;
use RuntimeException;

class VibyraResetPassword extends ResetPassword
{
    public function toMail($notifiable): MailMessage
    {
        $parameters = [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ];
        $legacyUrl = URL::to('/api/auth/password/open').'?'.http_build_query($parameters);
        $mode = $this->recoveryLinkMode();
        $url = $mode === 'legacy' ? $legacyUrl : $this->verifiedUrl($parameters);

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

    private function verifiedUrl(array $parameters): string
    {
        $configured = trim((string) config('auth.recovery_links.verified_url'));
        $parts = parse_url($configured);
        if (! is_array($parts)
            || ($parts['scheme'] ?? null) !== 'https'
            || empty($parts['host'])
            || ($parts['path'] ?? '') !== '/reset-password'
            || isset($parts['port'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new RuntimeException('RECOVERY_VERIFIED_URL must be an exact HTTPS /reset-password URL.');
        }

        return $configured.'?'.http_build_query($parameters);
    }
}
