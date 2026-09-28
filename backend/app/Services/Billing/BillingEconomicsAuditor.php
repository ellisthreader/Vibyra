<?php

namespace App\Services\Billing;

class BillingEconomicsAuditor
{
    public function audit(): array
    {
        $rows = [];
        foreach ((array) config('billing.plans', []) as $key => $plan) {
            if ($key === 'free') {
                continue;
            }
            $rows[] = $this->planRow($key, 'monthly', (array) $plan);
            $rows[] = $this->planRow($key, 'annual', (array) $plan);
        }
        foreach ((array) config('billing.topups', []) as $key => $topup) {
            $rows[] = $this->topupRow($key, (array) $topup);
        }

        return [
            'ok' => ! collect($rows)->contains(fn (array $row) => ! $row['passes']),
            'minimum_margin' => $this->minimumMargin(),
            'rows' => $rows,
        ];
    }

    private function planRow(string $plan, string $cycle, array $config): array
    {
        $annual = $cycle === 'annual';
        $grossGbp = ((int) ($config[$annual ? 'annual_price_pence' : 'monthly_price_pence'] ?? 0)) / 100;
        if ($annual) {
            $grossGbp /= 12;
        }
        $cap = (float) ($config[
            $annual ? 'annual_usd_cap_per_month' : 'usd_cap_per_month'
        ] ?? $config['usd_cap_per_month'] ?? 0);
        $credits = (int) ($config[$annual ? 'annual_credits' : 'monthly_credits'] ?? 0);
        $netRevenue = $this->netRevenueUsd($grossGbp);
        $providerCash = $cap * (1 + $this->openRouterFee());
        $operations = (float) config("billing.economics.plan_operations_reserve_usd.{$plan}", 0);

        return $this->row(
            'plan',
            "{$plan}:{$cycle}",
            $grossGbp,
            $netRevenue,
            $providerCash,
            $operations,
            $credits <= (int) floor($cap * 100)
        );
    }

    private function topupRow(string $key, array $config): array
    {
        $grossGbp = ((int) ($config['price_pence'] ?? 0)) / 100;
        $credits = (int) ($config['credits'] ?? 0);
        $providerCash = ($credits / 100) * (1 + $this->openRouterFee());

        return $this->row(
            'topup',
            $key,
            $grossGbp,
            $this->netRevenueUsd($grossGbp),
            $providerCash,
            (float) config('billing.economics.topup_operations_reserve_usd', 0),
            true
        );
    }

    private function row(
        string $kind,
        string $name,
        float $grossGbp,
        float $netRevenue,
        float $providerCash,
        float $operations,
        bool $creditsCovered,
    ): array {
        $profit = $netRevenue - $providerCash - $operations;
        $margin = $netRevenue > 0 ? $profit / $netRevenue : -1.0;

        return [
            'kind' => $kind,
            'name' => $name,
            'gross_gbp' => round($grossGbp, 2),
            'net_revenue_usd' => round($netRevenue, 2),
            'provider_cash_usd' => round($providerCash, 2),
            'operations_reserve_usd' => round($operations, 2),
            'profit_usd' => round($profit, 2),
            'margin' => round($margin, 4),
            'credits_covered' => $creditsCovered,
            'passes' => $creditsCovered && $margin >= $this->minimumMargin(),
        ];
    }

    private function netRevenueUsd(float $grossGbp): float
    {
        $tax = max(0.0, (float) config('billing.economics.consumer_tax_rate', 0.20));
        $proceeds = min(1.0, max(0.0, (float) config(
            'billing.economics.minimum_store_proceeds_rate',
            0.70
        )));
        $fx = max(0.01, (float) config('billing.economics.stress_gbp_usd', 1.20));

        return ($grossGbp / (1 + $tax)) * $proceeds * $fx;
    }

    private function openRouterFee(): float
    {
        return max(0.0, (float) config(
            'billing.economics.openrouter_credit_purchase_fee_rate',
            0.055
        ));
    }

    private function minimumMargin(): float
    {
        return max(0.0, (float) config('billing.economics.minimum_contribution_margin', 0.25));
    }
}
