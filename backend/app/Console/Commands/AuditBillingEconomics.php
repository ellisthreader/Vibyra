<?php

namespace App\Console\Commands;

use App\Services\Billing\BillingEconomicsAuditor;
use Illuminate\Console\Command;

class AuditBillingEconomics extends Command
{
    protected $signature = 'vibyra:audit-billing-economics';

    protected $description = 'Fail when a paid plan or top-up falls below conservative contribution-margin policy.';

    public function handle(BillingEconomicsAuditor $auditor): int
    {
        $audit = $auditor->audit();
        $this->table(
            ['Offer', 'Net USD', 'Provider USD', 'Ops USD', 'Profit USD', 'Margin', 'Credits', 'Result'],
            array_map(fn (array $row) => [
                $row['name'],
                number_format($row['net_revenue_usd'], 2),
                number_format($row['provider_cash_usd'], 2),
                number_format($row['operations_reserve_usd'], 2),
                number_format($row['profit_usd'], 2),
                number_format($row['margin'] * 100, 1).'%',
                $row['credits_covered'] ? 'covered' : 'exceeds cap',
                $row['passes'] ? 'PASS' : 'FAIL',
            ], $audit['rows'])
        );

        if (! $audit['ok']) {
            $this->error('Billing economics audit failed.');

            return self::FAILURE;
        }

        $this->info('Billing economics audit passed.');

        return self::SUCCESS;
    }
}
