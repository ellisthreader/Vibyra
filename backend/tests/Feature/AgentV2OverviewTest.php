<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Phase 8: activity feed, roster + per-device read markers, and `provider` on tool actions/events. */
class AgentV2OverviewTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const INBOX = ['msg00001' => ['from' => 'qa@example.com', 'subject' => 'Seeded', 'body' => 'Hello.']];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** Two confirmed reads and one write waiting for approval. */
    private function workedRun(): array
    {
        $gmail = $this->gmailInstall('me@example.com');
        $this->grant($gmail, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => self::INBOX]);
        $run = $this->admit('Reply to the seeded email.');
        $claimed = $this->claim();
        $this->callTool($claimed, 'gmail_search', $gmail, ['query' => 'x'], 'c1')->assertOk();
        $this->callTool($claimed, 'gmail_read', $gmail, ['id' => 'msg00001'], 'c2')->assertOk();
        $send = $this->callTool($claimed, 'gmail_send', $gmail, ['to' => 'qa@example.com', 'subject' => 'Re', 'body' => 'Hi'], 'c3')
            ->assertOk()->json('action');
        return [$gmail, $run, $claimed, $send];
    }

    public function test_actions_and_tool_events_name_their_provider_and_account(): void
    {
        [$gmail, $run] = $this->workedRun();
        $payload = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->json('run');
        $this->assertSame(['gmail', 'gmail', 'gmail'], array_column($payload['actions'], 'provider'));
        $this->assertSame('me@example.com', $payload['actions'][0]['account']);
        $this->assertSame('connected_account', $payload['fundingSource']);
        $this->assertArrayNotHasKey('tokensUsed', $payload);
        $events = collect($this->getJson('/api/agents/v2/runs/'.$run['id'].'/events')->json('events'));
        foreach (['tool.requested', 'tool.result', 'approval.requested'] as $type)
            $this->assertSame('gmail', $events->firstWhere('type', $type)['payload']['provider'], $type);
    }

    public function test_the_activity_feed_pages_receipts_and_filters_by_service_and_teammate(): void
    {
        [$gmail, $run] = $this->workedRun();
        $first = $this->getJson('/api/agents/v2/activity?limit=1')->assertOk();
        $this->assertCount(1, $first->json('items'));
        $item = $first->json('items.0');
        $this->assertSame(['gmail', 'me@example.com', $run['id'], $this->agent['id'], 'Inbox', $gmail, 'confirmed'],
            [$item['provider'], $item['accountLabel'], $item['runId'], $item['agentId'], $item['agentName'], $item['connectionId'], $item['status']]);
        $second = $this->getJson('/api/agents/v2/activity?limit=1&cursor='.$first->json('nextCursor'))->assertOk();
        $this->assertCount(1, $second->json('items'));
        $this->assertNotSame($item['id'], $second->json('items.0.id'));
        $this->assertNull($second->json('nextCursor'), 'The pending write has no receipt yet.');
        $this->assertEqualsCanonicalizing(['gmail_search', 'gmail_read'],
            [$item['tool'], $second->json('items.0.tool')]);
        $this->assertCount(2, $this->getJson('/api/agents/v2/activity?provider=gmail')->json('items'));
        $this->assertCount(0, $this->getJson('/api/agents/v2/activity?provider=github')->json('items'));
        $this->assertCount(2, $this->getJson('/api/agents/v2/activity?agentId='.$this->agent['id'])->json('items'));
        $this->assertCount(0, $this->getJson('/api/agents/v2/activity?agentId=00000000-0000-4000-8000-000000000000')->json('items'));
        $this->getJson('/api/agents/v2/activity?cursor=bm90LWEtY3Vyc29y')->assertStatus(422)->assertJsonPath('code', 'invalid_cursor');
        $this->assertStringNotContainsString('Hello.', $this->getJson('/api/agents/v2/activity')->getContent());
        // Another account sees none of it.
        $other = User::factory()->create();
        config(['agents_v2.user_ids' => $this->user->id.','.$other->id]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-session'), 'device_name' => 'Mac']);
        $this->withToken('other-session')->getJson('/api/agents/v2/activity')->assertOk()->assertJsonPath('items', []);
    }

    public function test_the_roster_reports_run_state_waiting_approvals_and_unread_per_device(): void
    {
        [, $run, $claimed, $send] = $this->workedRun();
        $mac = ['X-Vibyra-Device' => 'mac-1'];
        $phone = ['X-Vibyra-Device' => 'iphone-1'];
        $row = $this->getJson('/api/agents/v2/roster', $mac)->assertOk()->json('teammates.0');
        $this->assertSame([$this->agent['id'], 'waiting_for_approval', 1, $run['id'], true],
            [$row['agentId'], $row['status'], $row['waitingApprovalCount'], $row['lastRun']['id'], $row['unread']]);
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/read', ['cursor' => $row['readCursor']], $mac)->assertOk();
        $this->assertFalse($this->getJson('/api/agents/v2/roster', $mac)->json('teammates.0.unread'));
        $this->assertTrue($this->getJson('/api/agents/v2/roster', $phone)->json('teammates.0.unread'), 'Each device keeps its own dot.');
        // Declined, then finished: a new state to read; the old cursor is stale.
        $this->decide($send, 'decline')->assertOk();
        $running = $this->getJson('/api/agents/v2/roster', $mac)->json('teammates.0');
        $this->assertSame([0, null, false], [$running['waitingApprovalCount'], $running['readCursor'], $running['unread']]);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'],
            'answer' => 'Done.'], $this->runnerHeaders())->assertOk();
        $done = $this->getJson('/api/agents/v2/roster', $mac)->json('teammates.0');
        $this->assertSame(['completed', true], [$done['status'], $done['unread']]);
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/read', ['cursor' => $row['readCursor']], $mac)
            ->assertStatus(409)->assertJsonPath('code', 'stale_cursor');
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/read', ['cursor' => $done['readCursor']])->assertOk();
        $this->assertTrue($this->getJson('/api/agents/v2/roster', $mac)->json('teammates.0.unread'),
            'Without a device header the session is its own device.');
        $this->getJson('/api/agents/v2/roster', ['X-Vibyra-Device' => 'bad device!'])->assertStatus(422);
    }

    public function test_a_teammate_with_no_runs_is_idle_and_read(): void
    {
        $row = $this->getJson('/api/agents/v2/roster')->assertOk()->json('teammates.0');
        $this->assertSame(['idle', null, false, 0], [$row['status'], $row['lastRun'], $row['unread'], $row['waitingApprovalCount']]);
    }
}
