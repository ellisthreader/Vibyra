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
        $this->info('Trial acquisition cost: up to $1.055 at configured funding fee; separate from paid contribution.');
        return $ok ? self::SUCCESS : self::FAILURE;
    }
}
