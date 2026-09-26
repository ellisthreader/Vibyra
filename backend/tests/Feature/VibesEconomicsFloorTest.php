<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The contribution floor, guarded where a pricing edit will actually meet it.
 *
 * `vibyra:audit-vibes-economics` has always computed this correctly, but nothing
 * ran it: no test referenced the products, the audit or the floor, so a changed
 * `pence` or `credits` left the suite green and the breach surfaced in revenue
 * instead. The command is invoked rather than reimplemented here, so the figures
 * under test are the ones the audit prints and the two can never drift.
 */
class VibesEconomicsFloorTest extends TestCase
{
    public function test_every_offer_clears_the_contribution_floor(): void
    {
        $this->artisan('vibyra:audit-vibes-economics')->assertExitCode(0);
    }

    /**
     * The same arithmetic per offer, so a failure names the offer that broke it.
     * The command's exit code above says only that something did.
     */
    public function test_each_offer_is_individually_above_the_floor(): void
    {
        $e = config('billing.economics');
        $floor = $e['minimum_contribution_margin'];
        $this->assertGreaterThanOrEqual(0.60, $floor, 'The floor itself was lowered below 60%.');

        foreach (config('vibes.products') as $id => $p) {
            $net = $p['pence'] / 100 / (1 + $e['consumer_tax_rate'])
                * $e['minimum_store_proceeds_rate'] * $e['stress_gbp_usd'];
            $provider = $p['credits'] * config('vibes.micro_usd_per_credit') / 1000000
                * (1 + $e['openrouter_credit_purchase_fee_rate']);
            $ops = $p['kind'] === 'topup'
                ? $e['topup_operations_reserve_usd']
                : $e['plan_operations_reserve_usd'][$p['plan']];

            $this->assertGreaterThanOrEqual($floor, ($net - $provider - $ops) / $net,
                $id.' falls below the contribution floor at full redemption.');
        }
    }

    /**
     * A Vibe is a fixed quantity of provider spend, and every offer above is priced
     * from it. Changing it silently reprices all four at once, which is why it is
     * pinned here rather than only read.
     */
    public function test_a_vibe_stays_worth_one_cent_of_provider_spend(): void
    {
        $this->assertSame(10000, (int) config('vibes.micro_usd_per_credit'));
    }

    /**
     * A window narrower than the plan's own monthly grant sells Vibes the account
     * is not allowed to spend, which is a refund, not a margin.
     */
    public function test_no_plan_sells_more_than_its_window_permits(): void
    {
        $granted = collect(config('vibes.products'))->where('kind', 'subscription')->keyBy('plan');

        foreach (config('vibes.plans') as $plan => $limits) {
            $month = (int) ($granted[$plan]['credits'] ?? 0);
            if ($month === 0) continue;
            $this->assertGreaterThanOrEqual($month, (int) $limits['weekCredits'] * 365 / 12 / 7,
                $plan.' grants more Vibes per month than its week window lets the account spend.');
        }
    }
}
