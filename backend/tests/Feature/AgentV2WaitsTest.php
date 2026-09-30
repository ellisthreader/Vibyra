<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** A sign-in or limits wait parks the run instead of being re-offered every lease. */
class AgentV2WaitsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function park(string $code, array $extra = []): array
    {
        $run = $this->admit();
        $claimed = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/fail'), ['generation' => $claimed['generation'],
            'code' => $code, 'reason' => 'Waiting.', ...$extra], $this->runnerHeaders())->assertOk();
        return $run;
    }

    private function idle(): void
    {
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
    }

    public function test_a_signin_wait_is_not_reoffered_until_the_account_is_selected_again(): void
    {
        $run = $this->park('provider_signin');
        $this->assertSame('waiting_for_signin', $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.state'));
        $this->idle();
        $this->travel(config('agents_v2.lease_seconds') * 3)->seconds();
        $this->idle();
        $this->runtime = $this->registerRuntime('acct-1');
        $again = $this->claim();
        $this->assertSame($run['id'], $again['id']);
        $this->assertSame(2, $again['generation']);
        $this->assertSame('starting', $again['state']);
    }

    public function test_a_limits_pause_waits_for_the_reset_time(): void
    {
        $resume = now()->addMinutes(10)->startOfSecond();
        $run = $this->park('limits', ['resumeAt' => $resume->toIso8601String()]);
        $view = $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run');
        $this->assertSame('paused_by_limits', $view['state']);
        $this->assertSame($resume->toIso8601String(), $view['resumeAfter']);
        $this->travel(5)->minutes();
        $this->idle();
        $this->travel(6)->minutes();
        $this->assertSame($run['id'], $this->claim()['id']);
    }

    public function test_a_limits_pause_without_a_reset_time_waits_thirty_minutes(): void
    {
        $run = $this->park('limits');
        $this->travel(29)->minutes();
        $this->idle();
        $this->travel(2)->minutes();
        $claimed = $this->claim();
        $this->assertSame($run['id'], $claimed['id']);
        $this->assertNull($this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.resumeAfter'));
    }
}
