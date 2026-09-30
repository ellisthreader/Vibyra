<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** F-03 (security review 2026-09-30): the Mac runner holds a scoped key, never the account session, and cannot self-approve. */
class AgentV2RunnerKeyTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    private const SEND = ['to' => 'qa-recipient@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** @return array{0: string, 1: array, 2: array, 3: array} connection id, run, claim, the runner's view of the pending write */
    private function pendingWrite(): array
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $run = $this->admit('Email the summary.');
        $claimed = $this->claim();
        $call = $this->callTool($claimed, 'gmail_send', $connection, self::SEND, 'call-send')->assertOk();
        return [$connection, $run, $claimed, $call->json('action')];
    }

    private function fingerprint(string $actionId): string
    {
        return (string) DB::table('agent_tool_actions')->where('id', $actionId)->value('fingerprint');
    }

    public function test_the_runner_is_never_handed_a_fingerprint_it_could_approve_with(): void
    {
        [, $run, $claimed, $action] = $this->pendingWrite();
        $fingerprint = $this->fingerprint($action['id']);
        $this->assertSame('pending_approval', $action['state']);
        $this->assertArrayNotHasKey('fingerprint', $action);
        $poll = $this->getJson($this->runnerPath('/runs/'.$run['id'].'/actions/'.$action['id'].'?generation='.$claimed['generation']), $this->runnerHeaders())->assertOk();
        $this->assertStringNotContainsString($fingerprint, $poll->getContent());
        // The person's own view still carries it: that is the approval card.
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertJsonPath('run.actions.0.fingerprint', $fingerprint);
    }

    public function test_a_runner_credential_cannot_decide_even_with_the_right_fingerprint(): void
    {
        [, , , $action] = $this->pendingWrite();
        $decision = ['fingerprint' => $this->fingerprint($action['id']), 'decision' => 'allow'];
        // The original exploit: the runner's own requests carry the runner key.
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', $decision, $this->runnerHeaders())
            ->assertStatus(403)->assertJsonPath('code', 'runner_credential_refused');
        $this->assertSame('pending_approval', DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'));
        // With the runner key alone there is no person at all.
        $this->flushHeaders();
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', $decision, $this->runnerHeaders())->assertStatus(403);
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', $decision)->assertStatus(401);
        $this->assertSame('pending_approval', DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'));
        $this->withToken('v2-session')->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', $decision)
            ->assertOk()->assertJsonPath('action.state', 'completed');
    }

    public function test_user_endpoints_refuse_any_request_that_carries_a_runner_key(): void
    {
        $connection = $this->gmailInstall('owner@example.com');
        $path = '/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connection;
        $this->putJson($path, ['operations' => ['gmail_send']], $this->runnerHeaders())->assertStatus(403)->assertJsonPath('code', 'runner_credential_refused');
        $this->getJson('/api/agents/v2/connections', $this->runnerHeaders())->assertStatus(403);
        $this->getJson('/api/agents/v2/connections')->assertOk();
    }

    public function test_the_runner_key_alone_drives_every_runner_step_and_the_session_alone_does_not(): void
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->admit('Summarize.');
        $this->postJson($this->runnerPath('/claim'), [])->assertStatus(403)->assertJsonPath('code', 'invalid_runner_key'); // account session only
        $this->flushHeaders(); // the runner holds no account session from here on
        $claimed = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/heartbeat'), ['generation' => $claimed['generation']], $this->runnerHeaders())->assertOk();
        $this->getJson($this->runnerPath('/runs/'.$claimed['id'].'/tools?generation='.$claimed['generation']), $this->runnerHeaders())->assertOk();
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'is:unread'], 'r1')->assertOk()->assertJsonPath('action.state', 'completed');
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/events'), ['generation' => $claimed['generation'],
            'events' => [['type' => 'message.delta', 'text' => 'Reading.']]], $this->runnerHeaders())->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => 'Done.'],
            $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
    }

    public function test_another_accounts_key_and_a_removed_computer_are_refused(): void
    {
        $other = User::factory()->create();
        config(['agents_v2.user_ids' => $this->user->id.','.$other->id]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-session'), 'device_name' => 'Mac']);
        $mine = $this->runtime;
        $theirs = $this->withToken('other-session')->postJson('/api/agents/v2/runtimes', ['hostId' => str_repeat('c', 64), 'provider' => 'codex',
            'accountRef' => 'x', 'model' => 'm', 'providerVersion' => '1', 'capabilities' => ['controlledTools' => true]])->assertCreated()->json('runtime');
        $this->flushHeaders();
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [], ['X-Vibyra-Runner-Key' => $theirs['runnerKey']])->assertStatus(403);
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [], ['X-Vibyra-Runner-Key' => str_repeat('z', 64)])->assertStatus(403);
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [])->assertStatus(403);
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [], $this->runnerHeaders())->assertNoContent();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['revoked_at' => now()]);
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [], $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'host_revoked');
        config(['agents_v2.user_ids' => (string) $other->id]);
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['revoked_at' => null]);
        $this->postJson('/api/agents/v2/runner/'.$mine['id'].'/claim', [], $this->runnerHeaders())->assertStatus(403)->assertJsonPath('code', 'not_in_cohort');
    }

    public function test_the_legacy_double_check_returns_with_the_flag_off(): void
    {
        config(['agents_v2.runner_key_only' => false]);
        $this->flushHeaders();
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertStatus(401);
        $this->withToken('v2-session')->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
    }
}
