<?php

namespace Tests\Unit;

use App\Services\Billing\BillingEconomicsAuditor;
use Tests\TestCase;

class BillingEconomicsAuditorTest extends TestCase
{
    public function test_current_paid_offers_pass_conservative_margin_policy(): void
    {
        $audit = app(BillingEconomicsAuditor::class)->audit();

        $this->assertTrue($audit['ok']);
        $this->assertNotEmpty($audit['rows']);
        foreach ($audit['rows'] as $row) {
            $this->assertTrue($row['passes'], $row['name'].' should pass');
            $this->assertGreaterThanOrEqual(0.60, $row['margin']);
        }
    }

    public function test_audit_fails_when_plan_cap_exceeds_safe_economics(): void
    {
        config([
            'billing.plans.pro.usd_cap_per_month' => 90,
            'billing.plans.pro.monthly_credits' => 9000,
        ]);

        $audit = app(BillingEconomicsAuditor::class)->audit();
        $row = collect($audit['rows'])->firstWhere('name', 'pro:monthly');

        $this->assertFalse($audit['ok']);
        $this->assertFalse($row['passes']);
    }

    public function test_command_reports_a_passing_audit(): void
    {
        $this->artisan('vibyra:audit-billing-economics')
            ->expectsOutput('Billing economics audit passed.')
            ->assertSuccessful();
    }
}
