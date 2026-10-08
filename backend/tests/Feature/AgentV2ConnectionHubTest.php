<?php

namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, OAuthHop};
use Tests\TestCase;

/** The connections hub (status, holders, last use, disconnect) and honest catalogue readiness. */
class AgentV2ConnectionHubTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['chat_connectors.catalogue.google_drive.oauth.client_id' => 'gid', 'chat_connectors.catalogue.google_drive.oauth.client_secret' => 'gs']);
    }

    public function test_hub_lists_status_holders_last_use_and_scope_problems_until_reconnect(): void
    {
        $drive = $this->providerInstall('google_drive', 'owner@example.com', 'drive-token');
        $this->grant($drive, ['google_drive_search']);
        $hub = $this->getJson('/api/agents/v2/connections')->assertOk()->json('connections.0');
        $this->assertSame(['ok', 'owner@example.com', 'owner@example.com', null], [$hub['status'], $hub['accountLabel'], $hub['email'], $hub['lastUsedAt']]);
        $this->assertSame([['agentId' => $this->agent['id'], 'name' => 'Inbox', 'operations' => ['google_drive_search'], 'revision' => 1]], $hub['teammates']);
        $this->assertContains('https://www.googleapis.com/auth/drive.readonly', $hub['scopes']);
        $this->assertSame('requested', $hub['scopesSource']);
        $this->admit('Find the plan.');
        $claimed = $this->claim();
        $this->route('GET', '#drive/v3/files#', Http::response(['error' => ['message' => 'Request had insufficient authentication scopes.']], 403));
        $this->callTool($claimed, 'google_drive_search', $drive, ['query' => 'Plan'], 'r1')->assertJsonPath('action.result.reason', 'insufficient_scope');
        $hub = $this->getJson('/api/agents/v2/connections')->json('connections.0');
        $this->assertSame('insufficient_scope', $hub['status']);
        $this->assertNotNull($hub['lastUsedAt']);
        $this->assertSame('/api/agents/v2/connections/google_drive/start', $hub['reconnect']['path']);
        // Reconnecting the same account is a new credential generation: the scope problem is cleared.
        DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->update(['connected_at' => now()->addMinute()]);
        LegacyInstalls::sync($this->user->id);
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'ok')->assertJsonPath('connections.0.generation', 2);
    }

    public function test_unconfigured_providers_say_so_and_disconnect_revokes_grants_and_drops_the_credential(): void
    {
        $notion = $this->providerInstall('notion', 'Acme', 'notion-token');
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'unconfigured');
        $extra = Connection::query()->create(['user_id' => $this->user->id, 'provider' => 'google_drive', 'external_identity' => 'second@example.com',
            'credential' => Crypt::encryptString('second-token'), 'health' => 'healthy', 'generation' => 1, 'capability_revision' => 1]);
        $this->grant($extra->id, ['google_drive_read']);
        $this->deleteJson('/api/agents/v2/connections/'.$extra->id)->assertOk();
        $row = DB::table('agent_connections')->where('id', $extra->id)->first();
        $this->assertNull($row->credential);
        $this->assertNotNull($row->revoked_at);
        $this->assertNotNull(DB::table('agent_grants')->where('connection_id', $extra->id)->value('revoked_at'));
        $this->assertSame([$notion], array_column($this->getJson('/api/agents/v2/connections')->json('connections'), 'id'));
    }

    public function test_catalogue_readiness_is_honest(): void
    {
        $byProvider = fn () => collect($this->getJson('/api/agents/v2/catalogue')->assertOk()->json('providers'))->keyBy('provider');
        $all = $byProvider();
        $this->assertSame(['ready', null], [$all['google_drive']['readiness'], $all['google_drive']['reason']]);
        $this->assertSame(['unavailable', 'credentials_missing'], [$all['slack']['readiness'], $all['slack']['reason']]);
        $this->assertSame('ready', $all['github']['readiness'], 'GitHub also accepts a pasted token.');
        $this->assertSame(['unavailable', 'flag_off'], [$all['mcp']['readiness'], $all['mcp']['reason']]);
        $this->assertSame(['unavailable', 'credentials_missing'], [$all['composio_airtable']['readiness'], $all['composio_airtable']['reason']]);
        $this->assertContains(['tool' => 'slack_post_message', 'kind' => 'write'], $all['slack']['tools']);
        config(['agents_v2_mcp.enabled' => true, 'chat_connectors.composio_api_key' => 'k', 'agents_v2_composio.private_enabled' => true,
            'agents_v2_composio.toolkits.airtable.auth_config' => 'ac_1']);
        $all = $byProvider();
        $this->assertSame('ready', $all['mcp']['readiness']);
        $this->assertSame('isolation_unverified', $all['composio_airtable']['reason'], 'Composio stays unavailable until isolation is verified.');
        config(['chat_connectors.enabled' => false]);
        $this->assertTrue($byProvider()->every(fn ($p) => $p['reason'] === 'integrations_disabled'));
    }

    public function test_slack_add_account_asks_for_a_user_token_and_stores_its_granted_scopes(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.slack.oauth.client_id' => 'sid',
            'chat_connectors.catalogue.slack.oauth.client_secret' => 'ss']);
        $start = $this->postJson('/api/agents/v2/connections/slack/start')->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        $this->assertStringContainsString('search:read', $query['user_scope']);
        Http::fake(['slack.com/api/oauth.v2.access' => Http::response(['ok' => true, 'access_token' => 'xoxb-bot',
            'authed_user' => ['id' => 'U1', 'access_token' => 'xoxp-user', 'scope' => 'search:read,chat:write']]),
            'slack.com/api/auth.test' => fn ($r) => Http::response($r->header('Authorization')[0] === 'Bearer xoxp-user'
                ? ['ok' => true, 'team' => 'Acme'] : ['ok' => false, 'error' => 'invalid_auth'])]);
        $this->get('/api/connectors/callback/slack?state='.$query['state'].'&code=abc');
        $flow = $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'connected')->json('connection');
        $row = Connection::query()->findOrFail($flow['id']);
        $this->assertSame('xoxp-user', Crypt::decryptString($row->credential));
        $this->assertSame(['search:read', 'chat:write'], $row->scopes);
    }

    public function test_slack_add_account_also_records_the_bots_granted_scopes_so_mentions_can_be_judged(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.slack.oauth.client_id' => 'sid',
            'chat_connectors.catalogue.slack.oauth.client_secret' => 'ss']);
        $start = $this->postJson('/api/agents/v2/connections/slack/start')->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        $this->assertStringContainsString('app_mentions:read', $query['scope']);
        Http::fake(['slack.com/api/oauth.v2.access' => Http::response(['ok' => true, 'access_token' => 'xoxb-bot', 'scope' => 'chat:write,app_mentions:read',
            'authed_user' => ['id' => 'U1', 'access_token' => 'xoxp-user', 'scope' => 'search:read,chat:write']]),
            'slack.com/api/auth.test' => Http::response(['ok' => true, 'team' => 'Acme', 'team_id' => 'T0123ABCD', 'user_id' => 'U1'])]);
        $this->get('/api/connectors/callback/slack?state='.$query['state'].'&code=abc');
        $flow = $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'connected')->json('connection');
        $this->assertContains('app_mentions:read', Connection::query()->findOrFail($flow['id'])->scopes);
        $hub = collect($this->getJson('/api/agents/v2/connections')->json('connections'))->firstWhere('id', $flow['id']);
        $this->assertSame('ready', $hub['mentions']['state']);
        $this->assertSame('Acme · T0123ABCD/U1', $hub['accountLabel']);
    }

}
