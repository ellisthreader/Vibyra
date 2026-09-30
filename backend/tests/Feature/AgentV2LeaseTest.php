<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2LeaseTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_a_reclaimed_lease_fences_the_stale_runner(): void
    {
        $run = $this->admit();
        $first = $this->claim();
        $this->assertSame(1, $first['generation']);
        $this->assertSame('starting', $first['state']);
        $this->assertSame('Summarize my test emails.', $first['prompt']);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $second = $this->claim();
        $this->assertSame($run['id'], $second['id']);
        $this->assertSame(2, $second['generation']);
        $events = $this->runnerPath('/runs/'.$run['id'].'/events');
        $this->postJson($events, ['generation' => 1, 'events' => [['type' => 'message.delta', 'text' => 'stale']]],
            $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => 1, 'answer' => 'stale'],
            $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => 1], $this->runnerHeaders())
            ->assertStatus(409);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => 2], $this->runnerHeaders())
            ->assertOk()->assertJsonPath('generation', 2);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => 2, 'answer' => 'No mail today.'],
            $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
        $this->assertDatabaseMissing('agent_run_events', ['run_id' => $run['id'], 'type' => 'message.delta']);
        $types = DB::table('agent_run_events')->where('run_id', $run['id'])->orderBy('seq')->pluck('type')->all();
        $this->assertContains('run.completed', $types);
        $this->assertSame('No mail today.', $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.answer'));
    }

    public function test_runner_auth_needs_the_key_its_account_and_a_live_computer(): void
    {
        $this->admit();
        $this->postJson($this->runnerPath('/claim'))->assertStatus(403);
        $this->postJson($this->runnerPath('/claim'), [], ['X-Vibyra-Runner-Key' => str_repeat('x', 64)])->assertStatus(403);
        $other = User::factory()->create();
        config(['agents_v2.user_ids' => $this->user->id.','.$other->id]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other'), 'device_name' => 'X']);
        // The account session plays no part on a runner route (F-03); the legacy double check is one config flag away.
        $this->withToken('other')->postJson($this->runnerPath('/claim'), [], ['X-Vibyra-Runner-Key' => str_repeat('y', 64)])->assertStatus(403);
        config(['agents_v2.runner_key_only' => false]);
        $this->withToken('other')->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNotFound();
        config(['agents_v2.runner_key_only' => true]);
        $this->withToken('v2-session');
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['revoked_at' => now()]);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertStatus(409)
            ->assertJsonPath('code', 'host_revoked');
    }

    public function test_a_run_stays_pinned_to_its_account_and_a_rotated_key_is_refused(): void
    {
        $run = $this->admit();
        $oldKey = $this->runtime['runnerKey'];
        $this->runtime = $this->registerRuntime('acct-2');
        $this->postJson($this->runnerPath('/claim'), [], ['X-Vibyra-Runner-Key' => $oldKey])->assertStatus(403);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->runtime = $this->registerRuntime('acct-1');
        $this->assertSame($run['id'], $this->claim()['id']);
    }

    public function test_one_conversation_runs_one_turn_at_a_time_and_completion_needs_an_answer(): void
    {
        $first = $this->admit('First');
        $second = $this->admit('Second');
        $claimed = $this->claim();
        $this->assertSame($first['id'], $claimed['id']);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->postJson($this->runnerPath('/runs/'.$first['id'].'/complete'), ['generation' => 1, 'answer' => '   '],
            $this->runnerHeaders())->assertStatus(422);
        $this->postJson($this->runnerPath('/runs/'.$first['id'].'/complete'), ['generation' => 1, 'answer' => 'One'],
            $this->runnerHeaders())->assertOk();
        $next = $this->claim();
        $this->assertSame($second['id'], $next['id']);
        $this->assertSame([['runId' => $first['id'], 'prompt' => 'First', 'answer' => 'One']], $next['history']);
    }

    public function test_runner_failures_map_to_waits_or_failure_with_notification_hooks(): void
    {
        $run = $this->admit();
        $claimed = $this->claim();
        $fail = $this->runnerPath('/runs/'.$run['id'].'/fail');
        $this->postJson($fail, ['generation' => $claimed['generation'], 'code' => 'provider_signin',
            'reason' => 'Codex sign-in expired.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'waiting_for_signin');
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'run.waiting_signin']);
        $this->postJson($fail, ['generation' => $claimed['generation'], 'code' => 'provider_error',
            'reason' => 'Provider crashed.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'failed');
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'run.failed']);
    }
}
