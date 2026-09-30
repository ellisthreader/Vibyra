<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2AdmissionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_the_flag_and_cohort_gate_every_route(): void
    {
        config(['agents_v2.enabled' => false]);
        $this->getJson('/api/agents/v2/connections')->assertStatus(503)->assertJsonPath('code', 'agents_v2_disabled');
        config(['agents_v2.enabled' => true, 'agents_v2.user_ids' => '999999']);
        $this->getJson('/api/agents/v2/connections')->assertStatus(403)->assertJsonPath('code', 'not_in_cohort');
        config(['agents_v2.user_ids' => '*']);
        $this->getJson('/api/agents/v2/connections')->assertOk();
        $this->withToken('nobody')->getJson('/api/agents/v2/connections')->assertStatus(401);
    }

    public function test_same_key_and_payload_returns_the_existing_run_and_a_different_payload_is_refused(): void
    {
        $body = ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-duplicate-1', 'prompt' => "  Find it \n"];
        $first = $this->postJson('/api/agents/v2/runs', $body)->assertCreated()->assertJsonPath('replayed', false)->json('run');
        $this->assertSame("  Find it \n", $first['prompt'], 'Prompts are stored byte-exact.');
        $this->assertSame('connected_account', $first['fundingSource']);
        $this->assertSame('acct-1', $first['runtime']['accountRef']);
        $this->assertSame('queued', $first['state']);
        $again = $this->postJson('/api/agents/v2/runs', $body)->assertOk()->assertJsonPath('replayed', true)->json('run');
        $this->assertSame($first['id'], $again['id']);
        $this->postJson('/api/agents/v2/runs', [...$body, 'prompt' => 'Something else'])
            ->assertStatus(409)->assertJsonPath('code', 'idempotency_conflict');
        $this->assertSame(1, DB::table('agent_runs')->count());
        $this->assertSame(1, DB::table('agent_run_events')->where('type', 'run.admitted')->count());
    }

    public function test_admission_needs_a_selected_account_that_supports_controlled_tools(): void
    {
        $this->deleteJson('/api/agents/v2/runtimes/'.$this->runtime['id'])->assertOk();
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'no-runtime-1',
            'prompt' => 'Hi'])->assertStatus(409)->assertJsonPath('code', 'runtime_required');
        $this->registerRuntime('acct-2', false);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'no-runtime-2',
            'prompt' => 'Hi'])->assertStatus(409)->assertJsonPath('code', 'provider_unsupported');
    }

    public function test_an_offline_computer_leaves_the_run_waiting_for_it(): void
    {
        $this->travel(10)->minutes();
        $this->assertSame('waiting_for_computer', $this->admit()['state']);
    }

    public function test_events_replay_after_a_cursor_with_conditional_requests(): void
    {
        $run = $this->admit();
        $claimed = $this->claim();
        $path = $this->runnerPath('/runs/'.$run['id'].'/events');
        $this->postJson($path, ['generation' => $claimed['generation'], 'events' => [
            ['type' => 'message.delta', 'text' => 'Hel'], ['type' => 'message.delta', 'text' => 'lo ']]], $this->runnerHeaders())->assertOk();
        $all = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/events')->assertOk();
        $seqs = array_column($all->json('events'), 'seq');
        $this->assertSame(range(1, count($seqs)), $seqs, 'Sequence numbers are gap-free and ordered.');
        $types = array_column($all->json('events'), 'type');
        $this->assertSame(['run.admitted', 'run.claimed', 'run.state', 'run.state', 'message.delta', 'message.delta'], $types);
        $this->assertSame('lo ', $all->json('events.5.payload.text'));
        $cursor = 4;
        $tail = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/events?after='.$cursor)->assertOk();
        $this->assertSame([5, 6], array_column($tail->json('events'), 'seq'));
        $this->assertSame(6, $tail->json('nextCursor'));
        $etag = $tail->headers->get('ETag');
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/events?after='.$cursor, ['If-None-Match' => $etag])->assertStatus(304);
        $this->postJson($path, ['generation' => $claimed['generation'], 'events' => [['type' => 'message.delta', 'text' => '!']]],
            $this->runnerHeaders())->assertOk();
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/events?after='.$cursor, ['If-None-Match' => $etag])->assertOk()
            ->assertJsonPath('nextCursor', 7);
        $runTag = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->headers->get('ETag');
        $this->getJson('/api/agents/v2/runs/'.$run['id'], ['If-None-Match' => $runTag])->assertStatus(304);
    }

    public function test_cancel_fences_further_tool_calls_and_runner_writes(): void
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection);
        $this->fakeGmail(['gmail-token-a' => []]);
        $run = $this->admit();
        $claimed = $this->claim();
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk()->assertJsonPath('run.state', 'cancelled');
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'is:unread'], 'call-after-cancel')
            ->assertStatus(409)->assertJsonPath('code', 'run_cancelled');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'],
            'answer' => 'Done'], $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'run_cancelled');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $claimed['generation']],
            $this->runnerHeaders())->assertOk()->assertJsonPath('cancelRequested', true)->assertJsonPath('state', 'cancelled');
        $this->assertSame(0, DB::table('agent_tool_actions')->count());
        Http::assertNothingSent();
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
    }
}
