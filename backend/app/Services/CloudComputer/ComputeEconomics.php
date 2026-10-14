<?php
namespace App\Services\CloudComputer;

/** Monetary values are micro-USD. Wallet units are never compared to dollars. */
final class ComputeEconomics
{
    public function audit(array $profile): array
    {
        $e = config('cloud_preview.economics');
        $valid = is_array($e) && ($e['usd_per_gbp'] ?? 0) > 0 && ($e['vat_fraction'] ?? -1) >= 0
            && ($e['fee_fraction'] ?? -1) >= 0 && ($e['fee_fraction'] ?? 1) < 1 && ($e['fee_fixed_micro'] ?? 0) >= 0
            && ($e['fixed_micro_month'] ?? 0) > 0 && ($e['ai_micro_per_token'] ?? 0) > 0
            && ($e['reviewed_at'] ?? null) && now()->subDays(7)->lte($e['reviewed_at']) && now()->gte($e['reviewed_at']);
        if (!$valid) return ['passed' => false, 'reason' => 'Cost inputs need a fresh review.', 'offers' => []];
        $cost = (int) $profile['provider_micro_per_hour'];
        if ($cost <= 0 || $profile['units_per_hour'] <= 0) return ['passed' => false, 'reason' => 'Missing provider cost.', 'offers' => []];
        $perToken = $cost * 10000 / $profile['units_per_hour'];
        $results = [];
        foreach (config('membership.offers') as $key => $offer) {
            $credits = (int) $offer['credits'];
            $floor = (int) ($e['net_micro_per_offer'][$key] ?? 0);
            if ($floor <= 0) return ['passed' => false, 'reason' => 'Verify the lowest net receipt for every currency and offer.', 'offers' => $results];
            $net = (int) floor($offer['pence'] / 100 * $e['usd_per_gbp'] * 1000000
                / (1 + $e['vat_fraction']) * (1 - $e['fee_fraction']) - ($e['fee_fixed_micro'] ?? 0));
            $net = min($net, $floor);
            $included = max(0, (float) config('vibes.plans.pro_v2.cloudHours', 0)) * $cost;
            // The cap rolls over 30 days, while a billing month can have 31.
            // Include one extra day's starts; twelve such months also safely
            // bound a 365/366-day annual period rather than assuming 360 days.
            $starts = (int) config('cloud_preview.starts_per_account_month') + (int) config('cloud_preview.starts_per_account_day');
            $fixed = $offer['kind'] === 'subscription' ? ($e['fixed_micro_month'] + (int) config('cloud_preview.startup_exposure_micro') * $starts + $included) * (($offer['interval'] ?? '') === 'year' ? 12 : 1) : 0;
            // AI, compute and every mixture are bounded by their more expensive endpoint.
            $total = $fixed + (int) ceil($credits * max($perToken, $e['ai_micro_per_token']));
            $margin = $net > 0 ? ($net - $total) / $net : -1;
            $results[$key] = ['netMicroUsd' => $net, 'fullRedemptionCostMicroUsd' => $total,
                'margin' => $margin, 'passed' => $margin >= config('cloud_preview.minimum_margin', 0.4)];
        }
        return ['passed' => count($results) > 0 && !in_array(false, array_column($results, 'passed'), true),
            'reason' => 'Full redemption, retained storage and AI mix audit.', 'offers' => $results];
    }
}
