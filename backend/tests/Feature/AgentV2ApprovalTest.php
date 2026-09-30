<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Approvals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2ApprovalTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    private const SEND = ['to' => 'qa-recipient@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function preparedWrite(): array
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $run = $this->admit('Email the summary.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection, self::SEND, 'call-send')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        return [$connection, $run, $claimed, $action];
    }

    public function test_a_write_waits_for_exact_approval_refuses_a_stale_fingerprint_and_executes_once(): void
    {
        [, $run, $claimed, $action] = $this->preparedWrite();
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/messages/send'));
        $view = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk();
        $view->assertJsonPath('run.state', 'waiting_for_approval')->assertJsonPath('run.actions.0.arguments.to', self::SEND['to'])
            ->assertJsonPath('run.actions.0.fingerprint', $this->fingerprintOf($action));
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'run.waiting_approval']);
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'approval.requested']);
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => str_repeat('0', 64),
            'decision' => 'allow'])->assertStatus(409)->assertJsonPath('code', 'stale_fingerprint');
        // While approval is pending the runner can neither call more tools nor complete.
        $this->callTool($claimed, 'gmail_search', $action['connectionId'], ['query' => 'x'], 'call-2')
            ->assertStatus(409)->assertJsonPath('code', 'run_not_active');
        $decide = fn () => $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision',
            ['fingerprint' => $this->fingerprintOf($action), 'decision' => 'allow']);
        $decide()->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.status', 'confirmed')->assertJsonPath('action.receipt.providerResourceId', 'sent-1');
        $decide()->assertOk()->assertJsonPath('action.state', 'completed');
        app(Approvals::class)->dispatch($action['id']);
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/messages/send'));
        $this->getJson($this->runnerPath('/runs/'.$run['id'].'/actions/'.$action['id'].'?generation='.$claimed['generation']),
            $this->runnerHeaders())->assertOk()->assertJsonPath('action.result.id', 'sent-1');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'],
            'answer' => 'Sent.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
    }

    public function test_dispatch_rechecks_the_grant_and_a_decline_never_sends(): void
    {
        [$connection, $run, , $action] = $this->preparedWrite();
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connection, ['operations' => ['gmail_read']])
            ->assertOk()->assertJsonPath('grant.revision', 2);
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => $this->fingerprintOf($action),
            'decision' => 'allow'])->assertOk()->assertJsonPath('action.state', 'refused');
        Http::assertNothingSent();
        $this->assertSame('running', $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.state'));
        [, , , $second] = $this->secondWrite($connection);
        $this->postJson('/api/agents/v2/actions/'.$second['id'].'/decision', ['fingerprint' => $this->fingerprintOf($second),
            'decision' => 'decline'])->assertOk()->assertJsonPath('action.state', 'declined');
        Http::assertNothingSent();
    }

    public function test_an_expired_approval_cannot_run(): void
    {
        [, , , $action] = $this->preparedWrite();
        $this->travel(config('agents_v2.approval_seconds') + 1)->seconds();
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => $this->fingerprintOf($action),
            'decision' => 'allow'])->assertStatus(409)->assertJsonPath('code', 'approval_expired');
        $this->assertDatabaseHas('agent_tool_actions', ['id' => $action['id'], 'state' => 'expired']);
        Http::assertNothingSent();
    }

    public function test_agent_v2_never_touches_the_vibes_wallet_or_openrouter(): void
    {
        $tables = ['vibes_wallets', 'vibes_ledger', 'vibes_grants', 'vibes_turns', 'vibes_tools', 'vibes_spend_days'];
        // Zero balance: no Vibes grants or ledger entries at all. It must not block an account-funded run.
        DB::table('vibes_grants')->delete();
        DB::table('vibes_ledger')->delete();
        $before = array_map(fn ($t) => DB::table($t)->get()->toJson(), array_combine($tables, $tables));
        [$connection, $run, $claimed, $action] = $this->preparedWrite();
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'x'], 'call-before')->assertStatus(409);
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => $this->fingerprintOf($action),
            'decision' => 'allow'])->assertOk();
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'x'], 'call-read')->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'],
            'answer' => 'Done.'], $this->runnerHeaders())->assertOk();
        foreach ($tables as $table)
            $this->assertSame($before[$table], DB::table($table)->get()->toJson(), $table.' changed on the V2 path.');
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'openrouter.ai'));
        $this->assertSame('connected_account', DB::table('agent_runs')->value('funding_source'));
    }

    private function secondWrite(string $connection): array
    {
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connection,
            ['operations' => ['gmail_read', 'gmail_send']])->assertOk();
        $run = $this->admit('Email again.');
        $open = DB::table('agent_runs')->where('state', '!=', 'completed')->where('id', '!=', $run['id'])->value('id');
        $this->postJson('/api/agents/v2/runs/'.$open.'/cancel')->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection, self::SEND, 'call-send-2')->assertOk()->json('action');
        return [$connection, $run, $claimed, $action];
    }
}
