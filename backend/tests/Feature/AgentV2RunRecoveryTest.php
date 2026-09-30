<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** F-05 (security review 2026-09-30): a long answer or a vanishing runner can no longer loop a run on the Mac forever. */
class AgentV2RunRecoveryTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_an_oversized_final_answer_completes_clipped_with_a_notice_instead_of_refusing(): void
    {
        $run = $this->admit();
        $claimed = $this->claim();
        $limit = (int) config('agents_v2.max_answer_chars');
        $answer = str_repeat('0123456789', 30000); // 300,000 characters: a long report, or an injected "print everything"
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => $answer],
            $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
        $stored = DB::table('agent_runs')->where('id', $run['id'])->value('answer');
        $this->assertLessThanOrEqual($limit, mb_strlen($stored));
        $this->assertStringStartsWith('0123456789', $stored);
        $this->assertStringContainsString('shortened', $stored);
        $this->assertStringContainsString('300,000', $stored);
        $this->assertSame($stored, $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.answer'));
    }

    public function test_a_blank_answer_is_still_refused_so_the_runner_can_fail_the_run_instead(): void
    {
        $run = $this->admit();
        $claimed = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => "  \n"],
            $this->runnerHeaders())->assertStatus(422);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/fail'), ['generation' => $claimed['generation'], 'code' => 'runner_error',
            'reason' => 'The answer could not be posted.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'failed');
    }

    public function test_a_run_whose_runner_keeps_vanishing_fails_with_runner_error_after_three_attempts(): void
    {
        $run = $this->admit();
        foreach ([1, 2, 3] as $attempt) {
            $this->assertSame($attempt, $this->claim()['generation']);
            $this->travel(config('agents_v2.lease_seconds') + 5)->seconds(); // the Mac died or slept: the lease lapses
        }
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $view = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->json('run');
        $this->assertSame('failed', $view['state']);
        $this->assertStringContainsString('stopped answering', (string) $view['stateReason']);
        $failed = DB::table('agent_run_events')->where('run_id', $run['id'])->where('type', 'run.failed')->value('payload');
        $this->assertStringContainsString('runner_error', (string) $failed);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
    }

    public function test_waiting_for_limits_or_a_sign_in_never_counts_as_a_lost_attempt(): void
    {
        $run = $this->admit();
        foreach (range(1, 5) as $n) {
            $claimed = $this->claim();
            $this->assertSame($n, $claimed['generation']);
            $this->postJson($this->runnerPath('/runs/'.$run['id'].'/fail'), ['generation' => $claimed['generation'], 'code' => 'limits',
                'reason' => 'Usage limit.', 'resumeAt' => now()->addMinutes(2)->toIso8601String()], $this->runnerHeaders())->assertOk();
            $this->travel(3)->minutes();
        }
        $this->assertSame('paused_by_limits', $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.state'));
    }
}
