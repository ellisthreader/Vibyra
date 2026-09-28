<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class AuditVibesEconomics extends Command
{
    protected $signature = 'vibyra:audit-vibes-economics';
    protected $description = 'Audit full redemption of Vibes grants and the one-time trial subsidy';

    public function handle(): int
    {
        $e = config('billing.economics'); $rows = []; $ok = true;
        foreach (config('vibes.products') as $id => $p) {
            $net = $p['pence'] / 100 / (1 + $e['consumer_tax_rate']) * $e['minimum_store_proceeds_rate'] * $e['stress_gbp_usd'];
            $provider = $p['credits'] * config('vibes.micro_usd_per_credit') / 1000000 * (1 + $e['openrouter_credit_purchase_fee_rate']);
            $ops = $p['kind'] === 'topup' ? $e['topup_operations_reserve_usd'] : $e['plan_operations_reserve_usd'][$p['plan']];
            $margin = ($net - $provider - $ops) / $net;
            $pass = $margin >= $e['minimum_contribution_margin']; $ok = $ok && $pass;
            $rows[] = [$id, number_format($net, 2), number_format($provider, 2), number_format($margin * 100, 2).'%', $pass ? 'PASS' : 'FAIL'];
        }
        $this->table(['Offer', 'Net USD', 'Full redemption USD', 'Contribution', 'Result'], $rows);
        $this->info('Carryover is fully funded at grant time; never reclaim paid grants at renewal.');
        // Read from config rather than written down, so the trial cannot be retuned
        // without this line following it. It is the whole of Vibyra's free exposure:
        // one grant per account, never renewed, and nothing else funds a free turn.
        $trial = config('vibes.trial_credits') * config('vibes.micro_usd_per_credit') / 1000000
            * (1 + $e['openrouter_credit_purchase_fee_rate']);
        $this->info('Trial acquisition cost: up to $'.number_format($trial, 3)
            .' once per account ('.config('vibes.trial_credits').' Vibes, never renewed); separate from paid contribution.');

        return $this->auditWindows() && $ok ? self::SUCCESS : self::FAILURE;
    }

    /**
     * The two rolling usage windows, audited against the thing they must never do:
     * withhold an allowance that was sold. A window narrower than the plan's own
     * monthly grant would sell Vibes the account cannot spend, which is a refund
     * and a review, not a margin.
     *
     * The other column is why the windows exist at all. `daily_micro_usd_limit` is
     * one shared budget for the whole platform, and 'Accounts/day' is how many
     * accounts spending at their day ceiling it covers. When that number falls
     * towards one, the cap - not the plans - is what needs raising, or one busy
     * account answers 'AI is at capacity' to everyone else.
     */
    private function auditWindows(): bool
    {
        $e = config('billing.economics');
        $perCredit = config('vibes.micro_usd_per_credit') / 1000000 * (1 + $e['openrouter_credit_purchase_fee_rate']);
        $hours = (int) config('vibes.limits.session_hours');
        $budget = (float) config('vibes.daily_micro_usd_limit') / 1000000;
        $allowances = collect(config('vibes.products'))->where('kind', 'subscription')->keyBy('plan');
        $rows = []; $ok = true;
        foreach (config('vibes.plans') as $plan => $limits) {
            $granted = (int) ($allowances[$plan]['credits'] ?? 0);
            $week = (int) $limits['weekCredits'];
            // A month is 365/12/7 weeks. What the window permits per month has to
            // stay above what the plan grants per month, or the plan is withheld.
            $ceiling = $week * 365 / 12 / 7;
            $headroom = $granted > 0 ? $ceiling / $granted : INF;
            $pass = $headroom >= 1.0; $ok = $ok && $pass;
            // The most one account can spend in a day: whichever of the two windows
            // binds first once the session has run its course as often as it fits.
            $day = min($week, (int) $limits['sessionCredits'] * intdiv(24, max(1, $hours)));
            $rows[] = [$plan, $granted ?: '-', $limits['sessionCredits'], $week,
                '$'.number_format($week * $perCredit, 2),
                $granted > 0 ? number_format($headroom, 2).'x' : 'n/a',
                $day * $perCredit > 0 ? number_format($budget / ($day * $perCredit), 1) : '-',
                $pass ? 'PASS' : 'FAIL'];
        }
        $this->newLine();
        $this->table(['Plan', 'Vibes/month', 'Per '.$hours.'h', 'Per '.config('vibes.limits.week_days').'d',
            'Week provider USD', 'Monthly headroom', 'Accounts/day', 'Result'], $rows);
        $this->info('Headroom is what the week window permits per month over what the plan grants per month; '
            .'below 1.00x a plan sells Vibes its own window will not let the account spend.');
        $this->info('Accounts/day is how many accounts at their day ceiling the $'.number_format($budget, 2)
            .' daily platform budget covers (VIBES_DAILY_MICRO_USD_LIMIT).');

        return $ok;
    }
}
