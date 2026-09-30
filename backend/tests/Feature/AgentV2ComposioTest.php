<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Composio\ComposioCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, OAuthHop};
use Tests\TestCase;

/** Composio behind the V2 contract: per-user linking, isolation checks, reviewed tools, honest readiness (fixtures only). */
class AgentV2ComposioTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, OAuthHop;

    private const API = '#backend\.composio\.dev/api/v3';

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.composio_api_key' => 'platform-key', 'agents_v2_composio.private_enabled' => true,
            'agents_v2_composio.isolation_verified' => true, 'agents_v2_composio.toolkits.airtable.auth_config' => 'ac_air']);
    }

    private function account(string $userId, string $status = 'ACTIVE'): array
    {
        return ['id' => 'ca_123', 'user_id' => $userId, 'status' => $status, 'auth_config' => ['id' => 'ac_air'], 'toolkit' => ['slug' => 'airtable']];
    }

    private function link(?string $owner = null): array
    {
        $mine = app(ComposioCatalog::class)->userId($this->user->id);
        $this->route('POST', self::API.'/connected_accounts/link#', Http::response(['redirect_url' => 'https://connect.composio.dev/link/abc',
            'connected_account_id' => 'ca_123']));
        $this->route('GET', self::API.'/connected_accounts/ca_123#', Http::response($this->account($owner ?? $mine)));
        $start = $this->postJson('/api/agents/v2/composio/airtable/start')->assertOk()->json();
        Http::assertSent(fn ($r) => str_contains($r->url(), '/connected_accounts/link') && $r['user_id'] === $mine
            && $r['auth_config_id'] === 'ac_air' && $r->header('x-api-key')[0] === 'platform-key');
        $state = collect(Http::recorded())->map(fn ($p) => $p[0])->last(fn ($r) => str_contains($r->url(), '/link'))['callback_url'];
        parse_str((string) parse_url($state, PHP_URL_QUERY), $q);
        $this->openSignIn($start['url']);
        $this->get('/api/agents/v2/composio/callback?state='.$q['state'].'&status=success')->assertOk();
        return $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->json();
    }

    public function test_linking_accepts_only_this_accounts_active_connected_account(): void
    {
        $flow = $this->link('vibyra-999-someoneelse');
        $this->assertSame('failed', $flow['status']);
        $this->assertSame(0, DB::table('agent_connections')->count(), 'Another user\'s Composio account is never stored.');
        $flow = $this->link();
        $this->assertSame(['connected', 'composio_airtable'], [$flow['status'], $flow['connection']['provider']]);
        $this->assertStringNotContainsString('ca_123', json_encode($this->getJson('/api/agents/v2/connections')->json()));
    }

    /** F-01: the victim finishes a Composio link the attacker started; their connected account is never attached. */
    public function test_a_browser_that_never_opened_the_link_attaches_nothing(): void
    {
        $this->route('POST', self::API.'/connected_accounts/link#', Http::response(['redirect_url' => 'https://connect.composio.dev/link/abc', 'connected_account_id' => 'ca_123']));
        $this->route('GET', self::API.'/connected_accounts/ca_123#', Http::response($this->account(app(ComposioCatalog::class)->userId($this->user->id))));
        $start = $this->postJson('/api/agents/v2/composio/airtable/start')->assertOk()->json();
        $link = collect(Http::recorded())->map(fn ($p) => $p[0])->last(fn ($r) => str_contains($r->url(), '/link'))['callback_url'];
        $this->flushHeaders();
        $this->get('/api/agents/v2/composio/callback?state='.$this->queryOf($link)['state'].'&status=success')->assertOk()->assertSee('was not connected');
        $this->assertSame(0, DB::table('agent_connections')->count());
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'failed');
    }

    public function test_reviewed_tools_run_after_an_isolation_check_and_writes_wait_for_approval(): void
    {
        $conn = $this->link()['connection']['id'];
        $this->grant($conn, ['composio_airtable__create_record', 'composio_airtable__list_bases']);
        $this->admit('List my bases.');
        $claimed = $this->claim();
        $this->route('POST', self::API.'/tools/execute/AIRTABLE_LIST_BASES#', Http::response(['successful' => true, 'data' => ['bases' => [['id' => 'app1']]]]));
        $this->callTool($claimed, 'composio_airtable__list_bases', $conn, [], 'r1')->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.data.bases.0.id', 'app1');
        Http::assertSent(fn ($r) => str_contains($r->url(), 'tools/execute') && $r['connected_account_id'] === 'ca_123'
            && $r['user_id'] === app(ComposioCatalog::class)->userId($this->user->id));
        $args = ['baseId' => 'app1', 'tableIdOrName' => 'Tasks', 'fields' => ['Name' => 'Ship']];
        $this->callTool($claimed, 'composio_airtable__create_record', $conn, ['baseId' => 'app1'], 'w0')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $write = $this->callTool($claimed, 'composio_airtable__create_record', $conn, $args, 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->route('POST', self::API.'/tools/execute/AIRTABLE_CREATE_RECORD#', $this->timeout());
        $this->decide($write)->assertJsonPath('action.state', 'unknown');
        // The account was moved to someone else at Composio: refused before anything runs.
        $this->route('GET', self::API.'/connected_accounts/ca_123#', Http::response($this->account('vibyra-1-other')));
        $this->callTool($claimed, 'composio_airtable__list_bases', $conn, [], 'r2')->assertJsonPath('action.result.reason', 'forbidden');
        $this->route('GET', self::API.'/connected_accounts/ca_123#', Http::response($this->account(app(ComposioCatalog::class)->userId($this->user->id), 'EXPIRED')));
        $this->callTool($claimed, 'composio_airtable__list_bases', $conn, [], 'r3')->assertJsonPath('action.result.outcome', 'reconnect_required');
        $this->assertSame(1, $this->sent('POST', self::API.'/tools/execute/AIRTABLE_LIST_BASES#'));
    }

    public function test_unverified_isolation_keeps_it_unavailable_and_disconnect_deletes_the_remote_account(): void
    {
        $conn = $this->link()['connection']['id'];
        $this->route('DELETE', self::API.'/connected_accounts/ca_123#', Http::response(['success' => true]));
        config(['agents_v2_composio.isolation_verified' => false]);
        $this->postJson('/api/agents/v2/composio/airtable/start')->assertStatus(409)->assertJsonPath('code', 'provider_unavailable');
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'unconfigured');
        $this->deleteJson('/api/agents/v2/connections/'.$conn)->assertOk();
        $this->assertSame(1, $this->sent('DELETE', self::API.'/connected_accounts/ca_123#'));
        $this->assertNull(DB::table('agent_connections')->where('id', $conn)->value('credential'));
    }
}
