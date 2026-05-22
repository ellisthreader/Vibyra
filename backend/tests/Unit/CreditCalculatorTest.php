<?php

namespace Tests\Unit;

use App\Services\Billing\CreditCalculator;
use Tests\TestCase;

class CreditCalculatorTest extends TestCase
{
    public function test_dynamic_openrouter_slugs_resolve_as_billable_models(): void
    {
        $calc = new CreditCalculator();

        $this->assertSame('x-ai/grok-build-0.1', $calc->resolveSlug('x-ai/grok-build-0.1'));
        $this->assertSame('premium', $calc->tier('x-ai/grok-build-0.1'));
        $this->assertTrue($calc->planAllowsModel('starter', 'x-ai/grok-build-0.1'));
        $this->assertFalse($calc->planAllowsModel('free', 'x-ai/grok-build-0.1'));
        $this->assertSame('free', $calc->tier('baidu/cobuddy:free'));
        $this->assertNull($calc->modelConfig('../not-a-model'));
    }
}
