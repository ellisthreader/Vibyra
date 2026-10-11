<?php

namespace Tests\Feature;

use App\Services\Vibes\{OutOfTokens, PaceRefusal};
use Tests\TestCase;

/** The two limit refusals keep their status and sentence, and add a stable code clients can switch on. */
class OutOfTokensRefusalTest extends TestCase
{
    public function test_out_of_tokens_json_keeps_legacy_keys_and_adds_code_and_reason(): void
    {
        $r = new OutOfTokens('You need more Vibyra tokens for this reply.', 'balance');
        $this->assertSame(402, $r->getStatusCode());
        $response = $r->render();
        $this->assertSame(402, $response->getStatusCode());
        $this->assertSame(['ok' => false, 'code' => 'out_of_tokens', 'reason' => 'balance', 'error' => 'You need more Vibyra tokens for this reply.',
            'message' => 'You need more Vibyra tokens for this reply.'], $response->getData(true));
        $this->assertSame('paid_model', (new OutOfTokens('This model needs paid Vibyra tokens. Top up to use it.', 'paid_model'))->render()->getData(true)['reason']);
    }

    public function test_pace_refusal_json_shape_and_nullable_reset(): void
    {
        $r = new PaceRefusal('You have reached your 7-day pace limit.', ['window' => 'week', 'resetsAt' => null]);
        $this->assertSame(429, $r->render()->getStatusCode());
        $this->assertSame(['ok' => false, 'code' => 'pace_limit', 'error' => 'You have reached your 7-day pace limit.',
            'message' => 'You have reached your 7-day pace limit.', 'window' => 'week', 'resetsAt' => null], $r->render()->getData(true));
    }
}
