<?php

namespace App\Services\Membership;

final class Offers
{
    public function all(): array
    {
        return collect(config('membership.offers'))->map(fn ($p, $key) => [
            'offerKey' => $key, 'offerVersion' => config('membership.version'),
            'id' => $p['apple'], 'kind' => $p['kind'], 'plan' => $p['plan'],
            'credits' => $p['credits'], 'pence' => $p['pence'], 'currency' => 'GBP',
            'interval' => $p['interval'] ?? null,
            'stripeEnabled' => (bool) (config('membership.enabled') && config('membership.stripe_enabled') && config('membership.stripe_portal_configuration') && $p['stripe'] && config('services.stripe.secret') && config('services.stripe.webhook_secret')),
            'appleEnabled' => (bool) (config('membership.enabled') && config('membership.apple_enabled') && $p['apple']),
        ])->values()->all();
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
