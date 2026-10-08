<?php

namespace Tests\Feature;

use App\Services\ModelResilience\{Failover, ProviderBreaker};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\{Cache, DB};
use Tests\Feature\Support\FundedVibesTurns;
use Tests\TestCase;

/** Same-tier failover for a funded phone chat turn (PROVIDER_FAILOVER_ENABLED). */
class ProviderFailoverVibesTest extends TestCase
{
    use FundedVibesTurns;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fundedSetUp();
        config(['model_resilience.failover.enabled' => true]);
    }

    public function test_a_provider_error_moves_to_a_cheaper_or_equal_model_of_the_same_tier_and_settles_once(): void
    {
        $this->answers($this->failing(503), $this->ok(0.0004));
        $turn = $this->runTurn();

        $sent = $this->sent();
        $this->assertCount(2, $sent);
        $this->assertSame('qwen/qwen3.8-flash', $sent[0]['model']);
        $this->assertSame('google/gemini-3.8-flash', $sent[1]['model'], 'the same "fast" tier, never the dearer Haiku');
        $this->assertSame('completed', $turn->status);
        $this->assertSame('google/gemini-3.8-flash', $turn->served_model);
        $this->assertSame(1, (int) $turn->step_count, 'a retry is not a second step');
        $this->assertSame(1, DB::table('vibes_ledger')->where('reference', 'settle:'.$turn->id)->count());
        $this->assertSame(1, DB::table('vibes_ledger')->where('reference', 'hold:'.$turn->id)->count());
        $this->assertSame(0, (int) DB::table('vibes_spend_days')->value('held'));
        $this->assertSame('google/gemini-3.8-flash', $this->settlement($turn->id)['servedModel']);
    }

    public function test_the_retry_cannot_exceed_the_price_ceiling_the_turn_was_reserved_against(): void
    {
        // Alternate prices above the original's are never offered; with none left the turn is "busy", not downgraded or overcharged.
        $this->snapshot(['qwen/qwen3.8-flash' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
            'google/gemini-3.8-flash' => ['prompt' => '0.0000002', 'completion' => '0.0000009'],
            'anthropic/claude-haiku-4.5' => ['prompt' => '0.000001', 'completion' => '0.000005']]);
        $this->answers($this->failing(502));
        $turn = $this->runTurn();

        $this->assertCount(1, $this->sent());
        $this->assertSame('failed', $turn->status);
        $this->assertStringContainsString('busy', $turn->error);
        $this->assertSame(0, (int) $turn->charged);
    }

    public function test_both_attempts_failing_says_busy_and_charges_nothing(): void
    {
        $this->answers($this->failing(503), $this->failing(502));
        $turn = $this->runTurn();

        $this->assertCount(2, $this->sent());
        $this->assertSame('failed', $turn->status);
        $this->assertStringContainsString('busy right now', $turn->error);
        $this->assertStringContainsString('not charged', $turn->error);
        $this->assertSame(0, (int) $turn->charged);
        $this->assertSame(1, DB::table('vibes_ledger')->where('reference', 'settle:'.$turn->id)->count());
    }

    public function test_a_request_error_is_never_retried(): void
    {
        $this->answers($this->failing(400));
        $this->runTurn();
        $this->assertCount(1, $this->sent(), 'a 400 is the request\'s fault, not the provider\'s');
    }

    public function test_a_timeout_that_may_have_been_billed_keeps_the_operator_risk(): void
    {
        $this->answers(fn () => throw new ConnectionException('cURL error 28: Operation timed out'), $this->ok(0.0004));
        $turn = $this->runTurn();

        $this->assertSame('completed', $turn->status);
        $this->assertTrue((bool) $turn->failover_uncertain);
        $meta = $this->settlement($turn->id);
        $this->assertGreaterThan(0, $meta['unconfirmedMicroUsd'], 'the timed-out attempt may have cost money, so its reservation stays on the books');
    }

    public function test_a_timeout_on_every_attempt_is_parked_for_reconciliation_not_called_busy(): void
    {
        $this->answers(fn () => throw new ConnectionException('timed out'), fn () => throw new ConnectionException('timed out'));
        $turn = $this->runTurn();
        $this->assertSame('reconciling', $turn->status, 'an unknown outcome is reconciled from the generation, never refunded blind');
    }

    public function test_an_open_breaker_skips_the_failing_model_without_calling_it(): void
    {
        config(['model_resilience.failover.breaker.threshold' => 2]);
        $breaker = app(ProviderBreaker::class);
        $breaker->failure('qwen/qwen3.8-flash'); $breaker->failure('qwen/qwen3.8-flash');
        $this->answers($this->ok(0.0004));
        $turn = $this->runTurn();

        $this->assertSame(['google/gemini-3.8-flash'], array_column($this->sent(), 'model'));
        $this->assertSame('completed', $turn->status);
    }

    public function test_every_model_breaker_open_says_busy_before_any_call(): void
    {
        config(['model_resilience.failover.breaker.threshold' => 1]);
        $breaker = app(ProviderBreaker::class);
        foreach (['qwen/qwen3.8-flash', 'google/gemini-3.8-flash'] as $model) $breaker->failure($model);
        $this->answers();
        $turn = $this->runTurn();

        $this->assertCount(0, $this->sent());
        $this->assertStringContainsString('busy', $turn->error);
        $this->assertSame(0, (int) $turn->charged);
    }

    public function test_teammate_runs_keep_the_model_they_were_given(): void
    {
        // The Agent V2 rule (never fall back to a paid API) is a source-level guarantee: see the next test.
        $source = file_get_contents(app_path('Services/ModelResilience/VibesProviderCall.php'));
        $this->assertStringContainsString('$teammate', $source);
        $this->assertStringContainsString("if (! Failover::enabled() || \$teammate)", $source);
    }

    public function test_agent_v2_never_touches_the_funded_provider_path(): void
    {
        foreach (['Services/AgentRuns', 'Http/Controllers/AgentsV2'] as $dir) {
            foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path($dir))) as $file) {
                if ($file->getExtension() !== 'php') continue;
                $code = file_get_contents($file->getPathname());
                $this->assertStringNotContainsString('ModelResilience', $code, $file->getFilename());
                $this->assertStringNotContainsString('services.openrouter', $code, $file->getFilename());
            }
        }
    }

    public function test_with_the_flag_off_nothing_changes(): void
    {
        config(['model_resilience.failover.enabled' => false]);
        $this->answers($this->failing(503));
        $turn = $this->runTurn();
        $this->assertCount(1, $this->sent());
        $this->assertSame('reconciling', $turn->status, 'the old behaviour: park a 5xx for the recovery command');
        $this->assertFalse(Failover::enabled());
    }
}
