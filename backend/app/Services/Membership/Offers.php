<?php

namespace App\Services\Membership;

final class Offers
{
    public function all(?int $userId = null): array
    {
        return collect(config('membership.offers'))->map(fn ($p, $key) => [
            'offerKey' => $key, 'offerVersion' => config('membership.version'),
            'id' => $p['apple'], 'kind' => $p['kind'], 'plan' => $p['plan'],
            'credits' => $p['credits'], 'pence' => $p['pence'], 'currency' => 'GBP',
            'interval' => $p['interval'] ?? null,
            'stripeEnabled' => (bool) (config('legal.paid_sales_enabled') && config('membership.enabled') && config('membership.stripe_enabled') && config('membership.stripe_portal_configuration') && $p['stripe'] && config('services.stripe.secret') && config('services.stripe.webhook_secret') && $this->stripeEnvironmentReady()),
            'appleEnabled' => (bool) ($p['apple'] && ($userId !== null
                ? app(\App\Services\Vibes\AppleEnvironment::class)->purchasesEnabled($userId)
                : config('legal.paid_sales_enabled', false) && config('membership.enabled') && config('membership.apple_enabled'))),
        ])->values()->all();
    }
    public function stripeEnvironmentReady(): bool
    {
        if (!app()->environment('production')) return true;
        $key = (string) config('services.stripe.secret');
        return config('membership.stripe_environment') === 'live'
            && (str_starts_with($key, 'sk_live_') || str_starts_with($key, 'rk_live_'));
    }

    public function get(string $key, string $version): array
    {
        abort_unless($version === config('membership.version'), 409, 'The offer changed. Refresh prices.');
        $offer = config('membership.offers')[$key] ?? null;
        abort_unless($offer, 422, 'Unknown offer.');
        return $offer;
    }
    public function apple(string $id): ?array
    {
        foreach (config('membership.offers') as $key => $offer) {
            if ($offer['apple'] !== null && $offer['apple'] === $id) return ['key' => $key, ...$offer];
        }
        return null;
    }
}
