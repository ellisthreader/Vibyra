<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** A teammate whose Access list names Gmail runs with Gmail tools once Gmail is connected, without a second grant step. */
class AgentV2AccessListGrantsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['integrations' => json_encode(['gmail'])]);
    }

    public function test_the_access_list_becomes_a_grant_on_the_connected_account(): void
    {
        $gmail = $this->gmailInstall('me@example.com');
        $this->admit('Summarize unread Gmail.');
        $run = $this->claim();
        $this->assertContains('gmail_read', array_column($run['tools']['tools'], 'tool'));
        $this->assertSame([], $run['connectionGaps']);
        $grant = DB::table('agent_grants')->where('agent_id', $this->agent['id'])->where('connection_id', $gmail)->first();
        $this->assertEqualsCanonicalizing(app(ToolCatalog::class)->operations('gmail'), json_decode($grant->operations, true));
    }

    public function test_a_grant_the_person_removed_is_not_brought_back(): void
    {
        $gmail = $this->gmailInstall('me@example.com');
        $this->admit('Summarize unread Gmail.', 'send-first-run-0001');
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$gmail)->assertSuccessful();
        $this->postJson('/api/agents/v2/runs/preview', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-preview-0001', 'prompt' => 'Summarize unread Gmail.'])
            ->assertOk()->assertJsonPath('plan.missing.0.reason', 'not_granted');
        $this->assertSame(0, DB::table('agent_grants')->where('connection_id', $gmail)->whereNull('revoked_at')->count());
    }

    public function test_a_reconnect_is_granted_again_and_an_unlisted_service_is_not(): void
    {
        $github = $this->providerInstall('github', 'octocat', 'gh-token');
        $first = $this->gmailInstall('me@example.com');
        $this->admit('Summarize unread Gmail.', 'send-reconnect-0001');
        DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->where('integration', 'gmail')->delete();
        $second = $this->gmailInstall('other@example.com');
        $this->assertNotSame($first, $second);
        $this->admit('Summarize unread Gmail.', 'send-reconnect-0002');
        $this->assertSame(1, DB::table('agent_grants')->where('connection_id', $second)->whereNull('revoked_at')->count());
        $this->assertSame(0, DB::table('agent_grants')->where('connection_id', $github)->count(), 'Not on the Access list.');
    }
}
