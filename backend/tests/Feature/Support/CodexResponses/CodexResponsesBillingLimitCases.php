<?php

namespace Tests\Feature\Support\CodexResponses;

use App\Models\User;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;

trait CodexResponsesBillingLimitCases
{
    public function test_codex_responses_enforces_monthly_cost_limit_before_provider_dispatch(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Capped Codex User',
            'email' => 'capped-codex@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'capped-codex@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
            'openrouter_spend_period' => now('UTC')->format('Y-m'),
            'openrouter_spent_micro_usd' => 4_990_000,
        ]);

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.message', 'Monthly AI cost limit reached. Upgrade your plan or wait for the next billing month.')
            ->assertJsonPath('error.code', 'billing_monthly_usd_cap')
            ->assertJsonPath('error.details.billingStatus', 429);

        $this->assertCount(0, $history);
    }

    public function test_codex_responses_identifies_vibyra_credit_exhaustion_before_provider_dispatch(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'openai/gpt-5.4-mini' => ['tools'],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $creditsResetAt = now()->addMonth()->startOfSecond();
        $weeklyResetAt = now()->addDays(5)->startOfSecond();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Exhausted Codex User',
            'email' => 'exhausted-codex@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'exhausted-codex@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 0,
            'plan_renews_at' => $creditsResetAt,
            'weekly_credits_used' => 50,
            'weekly_credits_reset_at' => $weeklyResetAt,
        ]);

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.4-mini',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.code', 'billing_credits_exhausted')
            ->assertJsonPath('error.details.creditsBalance', 0)
            ->assertJsonPath('error.details.creditsResetAt', $creditsResetAt->toIso8601String())
            ->assertJsonPath('error.details.weeklyCreditsUsed', 50)
            ->assertJsonPath('error.details.weeklyCreditsCap', 50)
            ->assertJsonPath('error.details.weeklyCreditsResetAt', $weeklyResetAt->toIso8601String())
            ->assertJsonPath('error.details.billingStatus', 402)
            ->assertJsonPath(
                'error.message',
                'Your Vibyra token balance does not have enough credits for this request. This is not a company CLI API-key error. Top up or upgrade your Vibyra plan to continue.'
            );

        $this->assertCount(0, $history);
    }

    public function test_codex_responses_returns_non_retryable_burst_limit_details(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'openai/gpt-5.4-mini' => ['tools'],
        ]);
        $resetAt = now()->addHours(2)->startOfSecond();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Burst Capped Codex User',
            'email' => 'burst-capped-codex@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'burst-capped-codex@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 37,
            'burst_credits_used' => 15,
            'burst_credits_reset_at' => $resetAt,
            'weekly_credits_used' => 13,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.4-mini',
            'input' => str_repeat('Inspect this repository carefully. ', 500),
            'max_output_tokens' => 2000,
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.code', 'billing_burst_cap')
            ->assertJsonPath('error.details.creditsUsed', 15)
            ->assertJsonPath('error.details.creditsCap', 15)
            ->assertJsonPath('error.details.billingStatus', 429)
            ->assertJsonPath('error.details.resetAt', $resetAt->toIso8601String());
    }
}
