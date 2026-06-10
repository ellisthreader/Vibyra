<?php

namespace Tests\Unit;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Billing\OpenRouterRequestPolicy;
use Mockery;
use Tests\TestCase;

class OpenRouterRequestPolicyTest extends TestCase
{
    public function test_known_model_uses_conservative_fallback_ceiling(): void
    {
        $catalog = Mockery::mock(OpenRouterPricingCatalog::class);
        $catalog->shouldReceive('freshPricingFor')
            ->with('openai/gpt-5.5')
            ->andReturn(['prompt' => '0.000005', 'completion' => '0.00003']);

        $policy = new OpenRouterRequestPolicy($catalog);

        $this->assertSame([
            'max_price' => ['prompt' => 5.5, 'completion' => 33.0],
        ], $policy->provider('gpt-5.5'));
    }

    public function test_premium_request_multiplier_expands_provider_ceiling(): void
    {
        $catalog = Mockery::mock(OpenRouterPricingCatalog::class);
        $catalog->shouldReceive('freshPricingFor')
            ->with('openai/gpt-5.4-mini')
            ->andReturn(['prompt' => '0.00000075', 'completion' => '0.0000045']);

        $policy = new OpenRouterRequestPolicy($catalog);
        $prices = $policy->provider('gpt-5.4-mini', 3);

        $this->assertSame(2.25, $prices['max_price']['prompt']);
        $this->assertSame(13.5, $prices['max_price']['completion']);
    }
}
