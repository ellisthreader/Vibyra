<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, OAuthHop};
use Tests\TestCase;

/** "Add another account": a V2 OAuth flow stores an extra connection and leaves ordinary chat's install alone. */
class AgentV2AddAccountTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        foreach (['gmail', 'google_calendar', 'github'] as $slug)
            config(["chat_connectors.catalogue.$slug.oauth.client_id" => 'cid', "chat_connectors.catalogue.$slug.oauth.client_secret" => 'sec']);
        $this->route('POST', '#oauth2\.googleapis\.com/token#', Http::response(['access_token' => 'second-token',
            'refresh_token' => 'second-refresh', 'expires_in' => 3600]));
        $this->route('GET', '#oauth2/v3/userinfo#', fn ($r) => Http::response(['email' =>
            $r->hasHeader('Authorization', 'Bearer second-token') ? 'second@example.com' : 'owner@example.com']));
    }

    public function test_the_v2_flow_adds_a_second_gmail_account_and_keeps_the_chat_install(): void
    {
        $first = $this->providerInstall('gmail', 'owner@example.com', 'first-token');
        $start = $this->postJson('/api/agents/v2/connections/gmail/start')->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        $this->assertSame('select_account consent', $query['prompt'], 'Google shows the account picker.');
        $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'pending');
        $this->get('/api/connectors/callback/gmail?state='.$query['state'].'&code=abc')->assertOk();
        $flow = $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertOk()
            ->assertJsonPath('status', 'connected')->assertJsonPath('connection.account', 'second@example.com')
            ->assertJsonPath('connection.source', 'connection')->json();
        $this->assertNotSame($first, $flow['connection']['id']);
        $install = DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->where('integration', 'gmail')->first();
        $this->assertSame('first-token', Crypt::decryptString($install->credential), 'Ordinary chat keeps its account.');
        $this->assertSame('owner@example.com', $install->account_label);
        $accounts = array_column($this->getJson('/api/agents/v2/connections')->json('connections'), 'account');
        $this->assertEqualsCanonicalizing(['owner@example.com', 'second@example.com'], $accounts);
        $row = DB::table('agent_connections')->where('id', $flow['connection']['id'])->first();
        $this->assertSame('second-refresh', Crypt::decryptString($row->refresh_token));
        // The callback state is single use: a replay connects nothing more.
        $this->get('/api/connectors/callback/gmail?state='.$query['state'].'&code=abc');
        $this->assertSame(2, DB::table('agent_connections')->where('provider', 'gmail')->whereNull('revoked_at')->count());
    }

    public function test_the_ordinary_chat_flow_still_replaces_the_single_install(): void
    {
        $this->providerInstall('gmail', 'owner@example.com', 'first-token');
        $start = $this->postJson('/api/connectors/gmail/start')->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        $this->assertSame('consent', $query['prompt']);
        $this->get('/api/connectors/callback/gmail?state='.$query['state'].'&code=abc')->assertOk();
        $install = DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->where('integration', 'gmail')->first();
        $this->assertSame('second@example.com', $install->account_label);
        $this->assertSame(0, DB::table('agent_connections')->whereNull('install_id')->count(), 'No extra connection rows.');
    }

    public function test_calendar_add_account_asks_for_the_agent_scope_and_denial_or_errors_are_typed(): void
    {
        $start = $this->postJson('/api/agents/v2/connections/google_calendar/start')->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        $this->assertStringContainsString('calendar.freebusy', $query['scope']);
        $this->assertStringContainsString('calendar.calendarlist.readonly', $query['scope']);
        $chat = $this->openSignIn($this->postJson('/api/connectors/google_calendar/start')->assertOk()->json('url'));
        $this->assertStringNotContainsString('freebusy', urldecode($chat), 'Ordinary chat scope is unchanged.');
        $this->get('/api/connectors/callback/google_calendar?state='.$query['state'].'&error=access_denied');
        $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'failed')
            ->assertJsonPath('connection', null);
        $this->postJson('/api/agents/v2/connections/stripe/start')->assertStatus(404)->assertJsonPath('code', 'unknown_provider');
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => '']);
        $this->postJson('/api/agents/v2/connections/gmail/start')->assertStatus(409)->assertJsonPath('code', 'oauth_unavailable');
        config(['agents_v2.user_ids' => '']);
        $this->postJson('/api/agents/v2/connections/github/start')->assertStatus(403)->assertJsonPath('code', 'not_in_cohort');
    }

    public function test_a_pasted_token_adds_a_second_github_account(): void
    {
        $this->providerInstall('github', '@owner', 'gh-one');
        $this->route('GET', '#api\.github\.com/user$#', fn ($r) => $r->hasHeader('Authorization', 'Bearer gh-two')
            ? Http::response(['login' => 'second']) : Http::response(['message' => 'Bad credentials'], 401));
        $this->postJson('/api/agents/v2/connections', ['provider' => 'github', 'credential' => 'gh-two'])->assertCreated()
            ->assertJsonPath('connection.account', '@second')->assertJsonPath('connection.source', 'connection');
        $this->postJson('/api/agents/v2/connections', ['provider' => 'github', 'credential' => 'bad'])->assertStatus(422)
            ->assertJsonPath('code', 'credential_refused');
        $this->assertSame(2, DB::table('agent_connections')->where('provider', 'github')->whereNull('revoked_at')->count());
    }
}
