<?php

namespace Tests\Unit;

use App\Http\Controllers\Concerns\ChatOpenRouterHelpers;
use Tests\TestCase;

class ChatOpenRouterReasoningTest extends TestCase
{
    public function test_model_default_omits_reasoning_configuration(): void
    {
        $helper = new class
        {
            use ChatOpenRouterHelpers;

            public function reasoning(string $effort): ?array
            {
                return $this->buildReasoningPayload($effort, 800, 'meta-llama/llama-3.3-70b-instruct');
            }
        };

        $this->assertNull($helper->reasoning('default'));
    }

    public function test_extra_high_is_forwarded_to_openrouter(): void
    {
        $helper = new class
        {
            use ChatOpenRouterHelpers;

            public function reasoning(string $effort): ?array
            {
                return $this->buildReasoningPayload($effort, 800, 'openai/gpt-5.4');
            }
        };

        $this->assertSame(['effort' => 'xhigh'], $helper->reasoning('xhigh'));
    }

    public function test_gpt_56_pro_reasoning_uses_reasoning_mode(): void
    {
        $helper = new class
        {
            use ChatOpenRouterHelpers;

            public function reasoning(string $effort): ?array
            {
                return $this->buildReasoningPayload($effort, 800, 'openai/gpt-5.6-sol');
            }
        };

        $this->assertSame(['effort' => 'medium', 'mode' => 'pro'], $helper->reasoning('pro'));
    }

    public function test_gpt_56_max_reasoning_uses_max_effort(): void
    {
        $helper = new class
        {
            use ChatOpenRouterHelpers;

            public function reasoning(string $effort): ?array
            {
                return $this->buildReasoningPayload($effort, 800, 'openai/gpt-5.6-sol');
            }
        };

        $this->assertSame(['effort' => 'max'], $helper->reasoning('max'));
    }
}
