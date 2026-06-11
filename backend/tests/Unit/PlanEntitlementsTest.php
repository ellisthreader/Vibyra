<?php

namespace Tests\Unit;

use App\Services\Billing\PlanEntitlements;
use Tests\TestCase;

class PlanEntitlementsTest extends TestCase
{
    public function test_context_output_is_clipped_to_the_plan_cap(): void
    {
        config([
            'billing.plans.free.context_token_cap' => 1000,
        ]);
        $limits = app(PlanEntitlements::class);

        $this->assertSame(1000, $limits->contextTokenCap('free'));
        $this->assertSame(1, $limits->maxConcurrentTerminalAgents('free'));
        $this->assertSame(400, $limits->boundedOutputTokens('free', 600, 800));
        $this->assertSame(800, $limits->boundedOutputTokens('free', 100, 800));
        $this->assertNull($limits->boundedOutputTokens('free', 300, 800, 800));
    }

    public function test_unknown_plans_fail_closed_to_free_limits(): void
    {
        config([
            'billing.plans.free.context_token_cap' => 16000,
        ]);

        $this->assertSame(
            16000,
            app(PlanEntitlements::class)->contextTokenCap('not-a-plan')
        );
    }
}
