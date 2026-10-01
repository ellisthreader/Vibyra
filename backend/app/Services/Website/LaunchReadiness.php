<?php

namespace App\Services\Website;

/** Configuration inspection only: no provider requests, customer reads or mutations. */
final class LaunchReadiness
{
    public function read(): array
    {
        $secret = (string) config('services.stripe.secret');
        $checks = [
            'production_environment' => app()->environment('production'),
            'debug_disabled' => !config('app.debug'),
            'app_origin_owned' => $this->ownedUrl((string) config('app.url')),
            'mail_transport_configured' => $this->mailReady(),
            'mail_sender_owned' => filter_var(config('mail.from.address'), FILTER_VALIDATE_EMAIL) !== false
                && str_ends_with(strtolower((string) config('mail.from.address')), '@vibyra.net'),
            'paid_sales_enabled' => (bool) config('legal.paid_sales_enabled'),
            'membership_enabled' => (bool) config('membership.enabled'),
            'stripe_sales_enabled' => (bool) config('membership.stripe_enabled'),
            'stripe_live_environment' => config('membership.stripe_environment') === 'live',
            'stripe_live_key' => str_starts_with($secret, 'sk_live_') || str_starts_with($secret, 'rk_live_'),
            'stripe_webhook_configured' => str_starts_with((string) config('services.stripe.webhook_secret'), 'whsec_'),
            'stripe_portal_configured' => str_starts_with((string) config('membership.stripe_portal_configuration'), 'bpc_'),
        ];
        foreach (['success_url', 'cancel_url', 'portal_return_url'] as $key) {
            $checks['stripe_'.$key.'_owned'] = $this->ownedUrl((string) config('services.stripe.'.$key));
        }
        foreach (['pro_monthly', 'pro_annual', 'tokens_80', 'tokens_200', 'tokens_450'] as $offer) {
            $checks['stripe_price_'.$offer.'_configured'] = str_starts_with((string) config('membership.offers.'.$offer.'.stripe'), 'price_');
        }
        $cutoff = (string) config('membership.new_accounts_from');
        try { $checks['new_account_enrollment_configured'] = $cutoff !== '' && \Illuminate\Support\Carbon::parse($cutoff)->lte(now()); }
        catch (\Throwable) { $checks['new_account_enrollment_configured'] = false; }
        return ['scope' => 'configuration_only', 'ready' => !in_array(false, $checks, true), 'checks' => $checks];
    }

    private function ownedUrl(string $url): bool
    {
        $parts = parse_url($url);
        return is_array($parts) && ($parts['scheme'] ?? '') === 'https'
            && in_array(strtolower($parts['host'] ?? ''), ['vibyra.net', 'www.vibyra.net'], true)
            && !isset($parts['user']) && !isset($parts['pass'])
            && (!isset($parts['port']) || $parts['port'] === 443);
    }

    private function mailReady(): bool
    {
        $mailer = (array) config('mail.mailers.'.config('mail.default'), []);
        return match ($mailer['transport'] ?? '') {
            'resend' => filled(config('services.resend.key')),
            'postmark' => filled(config('services.postmark.key')),
            'ses', 'ses-v2' => filled(config('services.ses.key')) && filled(config('services.ses.secret')) && filled(config('services.ses.region')),
            'smtp' => $this->smtpReady($mailer),
            default => false, // log/array/failover-to-log never establishes delivery readiness.
        };
    }

    private function smtpReady(array $mailer): bool
    {
        $url = empty($mailer['url']) ? [] : (parse_url($mailer['url']) ?: []);
        $host = strtolower((string) ($url['host'] ?? $mailer['host'] ?? ''));
        return $host !== '' && !in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            && !preg_match('/\.(test|invalid|example)$/', $host)
            && filled($url['user'] ?? $mailer['username'] ?? null)
            && filled($url['pass'] ?? $mailer['password'] ?? null)
            && (int) ($url['port'] ?? $mailer['port'] ?? 0) > 0;
    }
}
