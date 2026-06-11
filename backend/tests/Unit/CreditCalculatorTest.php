<?php

namespace Tests\Unit;

use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Billing\TerminalOutputBudget;
use Tests\TestCase;

class CreditCalculatorTest extends TestCase
{
    public function test_dynamic_openrouter_slugs_resolve_as_billable_models(): void
    {
        $catalog = $this->createMock(OpenRouterPricingCatalog::class);
        $catalog->method('freshPricingFor')->willReturnMap([
            ['x-ai/grok-build-0.1', ['prompt' => '0.000005', 'completion' => '0.000025']],
            ['baidu/cobuddy:free', ['prompt' => '0', 'completion' => '0']],
        ]);
        $calc = new CreditCalculator($catalog);

        $this->assertSame('x-ai/grok-build-0.1', $calc->resolveSlug('x-ai/grok-build-0.1'));
        $this->assertSame('premium', $calc->tier('x-ai/grok-build-0.1'));
        $this->assertTrue($calc->planAllowsModel('starter', 'x-ai/grok-build-0.1'));
        $this->assertFalse($calc->planAllowsModel('free', 'x-ai/grok-build-0.1'));
        $this->assertSame('free', $calc->tier('baidu/cobuddy:free'));
        $this->assertNull($calc->modelConfig('../not-a-model'));
    }

    public function test_dynamic_model_estimates_include_request_price_and_conservative_safety(): void
    {
        $catalog = $this->createMock(OpenRouterPricingCatalog::class);
        $catalog->method('freshPricingFor')->with('vendor/model')->willReturn([
            'prompt' => '0.000001',
            'completion' => '2e-6',
            'request' => '0.01',
        ]);
        config([
            'billing.openrouter_pricing.dynamic_model_safety_multiplier' => 2.0,
            'billing.openrouter_pricing.reservation_safety_multiplier' => 1.5,
        ]);

        $calc = new CreditCalculator($catalog);

        $this->assertEqualsWithDelta(0.03, $calc->estimateUsd('vendor/model', 1000, 2000), 0.000001);
        $this->assertEqualsWithDelta(0.045, $calc->estimateReservationUsd('vendor/model', 1000, 2000), 0.000001);
    }

    public function test_usage_estimate_excludes_reservation_safety_margin(): void
    {
        $catalog = $this->createMock(OpenRouterPricingCatalog::class);
        $catalog->method('freshPricingFor')->willReturn(null);
        config([
            'billing.openrouter_pricing.reservation_safety_multiplier' => 1.5,
        ]);
        $calc = new CreditCalculator($catalog);

        $this->assertSame(
            3,
            $calc->estimateUsageCredits('google/gemini-3.5-flash', 12_500, 256, true)
        );
        $this->assertSame(
            7,
            $calc->estimateCredits('google/gemini-3.5-flash', 12_500, 2000, true)
        );
    }

    public function test_terminal_output_budget_reduces_only_the_output_needed_to_fit_balance(): void
    {
        $catalog = $this->createMock(OpenRouterPricingCatalog::class);
        $catalog->method('freshPricingFor')->with('x-ai/grok-build-0.1')->willReturn([
            'prompt' => '0.000001',
            'completion' => '0.000002',
        ]);
        $calc = new CreditCalculator($catalog);
        $budget = new TerminalOutputBudget;

        $outputTokens = $budget->affordableOutputTokens(
            $calc,
            'x-ai/grok-build-0.1',
            9000,
            2000,
            800,
            2,
        );

        $this->assertGreaterThanOrEqual(800, $outputTokens);
        $this->assertLessThan(2000, $outputTokens);
        $this->assertLessThanOrEqual(
            2,
            $calc->estimateTerminalReservationCredits(
                'x-ai/grok-build-0.1',
                9000,
                $outputTokens,
                true
            )
        );
    }
}
