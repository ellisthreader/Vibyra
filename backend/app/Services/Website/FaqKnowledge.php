<?php

namespace App\Services\Website;

use App\Services\Membership\Offers;

/** Public FAQ and purchase pages use the same current offer catalogue. */
class FaqKnowledge
{
    public function text(): string
    {
        $path = resource_path('knowledge/website-faq.md');
        $facts = is_file($path) ? (string) file_get_contents($path) : '';
        return rtrim($facts)."\n\n".$this->planCatalogue();
    }

    public function fallback(string $question): string
    {
        if (preg_match('/price|cost|plan|pro|token|credit|pay|subscription|annual|monthly/i', $question)) {
            return 'The current plans and purchase availability are shown at /billing. Desktop downloads are free at /downloads; your coding agents’ own subscriptions are separate.';
        }
        return 'Please check the information on this page or email support@vibyra.net for help. Current desktop downloads are listed at /downloads.';
    }

    private function planCatalogue(): string
    {
        $lines = ['## Current public offer catalogue (GBP, VAT included)',
            'These are the only prices to quote. An offer marked unavailable cannot currently be purchased on the website.'];
        foreach (app(Offers::class)->all() as $offer) {
            $period = $offer['interval'] === 'year' ? 'per year, tokens up front' : ($offer['interval'] === 'month' ? 'per month' : 'one time');
            $label = $offer['kind'] === 'subscription' ? 'Vibyra Pro' : 'Token top-up';
            $lines[] = sprintf('- %s: £%s %s, %d tokens. Website purchase: %s.', $label,
                number_format($offer['pence'] / 100, 2, '.', ''), $period, $offer['credits'],
                $offer['stripeEnabled'] ? 'available for eligible verified accounts' : 'not available yet');
        }
        $lines[] = config('membership.enabled') && config('membership.free_enabled')
            ? 'A limited verified-account free-token pilot may be available; sign in to see eligibility.'
            : 'The free-token pilot is not currently enabled.';
        return implode("\n", $lines);
    }
}
