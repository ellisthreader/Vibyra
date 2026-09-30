<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, FakeMcpServer, OAuthHop};
use Tests\TestCase;

/** Remote MCP safety: SSRF after DNS, redirects, caps, protocol and OAuth metadata checks, token refresh (fixtures only). */
class AgentV2McpSecurityTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, FakeMcpServer, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootMcp();
    }

    private function add(string $url)
    {
        return $this->postJson('/api/agents/v2/mcp/servers', ['url' => $url]);
    }

    private function hits(string $host): int
    {
        return collect(Http::recorded())->filter(fn ($p) => parse_url($p[0]->url(), PHP_URL_HOST) === $host)->count();
    }

    public function test_private_loopback_link_local_and_metadata_destinations_are_refused_before_any_request(): void
    {
        foreach (['https://evil.example.com/mcp', 'https://metadata.example.com/latest', 'https://v6.example.com/mcp',
            'http://mcp.example.com/mcp', 'https://93.184.216.34/mcp', 'https://169.254.169.254/latest/meta-data',
            'https://localhost/mcp', 'https://mcp.example.com:8443/mcp', 'https://user@mcp.example.com/mcp', 'https://unknown.example.com/mcp'] as $url)
            $this->add($url)->assertStatus(422)->assertJsonPath('code', 'blocked_destination');
        $this->assertSame(0, count(Http::recorded()));
        $this->assertSame(0, DB::table('agent_connections')->count());
    }

    public function test_redirects_are_rechecked_and_never_followed_to_private_addresses(): void
    {
        $this->on('#^https://mcp\.example\.com/mcp#', Http::response('', 307, ['Location' => 'https://evil.example.com/mcp']));
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
        $this->extraRoutes = [];
        $this->withOAuth();
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource#', Http::response('', 302,
            ['Location' => 'https://metadata.example.com/latest/meta-data']));
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'blocked_destination');
        $this->assertSame(0, $this->hits('evil.example.com') + $this->hits('metadata.example.com'));
        $this->assertSame(0, DB::table('agent_connections')->whereNull('revoked_at')->count(), 'A server that failed to add leaves nothing active.');
    }

    public function test_metadata_must_name_this_resource_and_support_pkce(): void
    {
        $this->withOAuth();
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource#', Http::response(['resource' => 'https://other.example.com/mcp',
            'authorization_servers' => ['https://auth.example.com']]));
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource#', Http::response(['resource' => 'https://mcp.example.com/mcp',
            'authorization_servers' => ['https://auth.example.com']]));
        $this->on('#^https://auth\.example\.com/\.well-known/oauth-authorization-server$#', Http::response(['issuer' => 'https://auth.example.com',
            'authorization_endpoint' => 'https://auth.example.com/authorize', 'token_endpoint' => 'https://auth.example.com/token']));
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
        $this->on('#^https://auth\.example\.com/\.well-known/oauth-authorization-server$#', Http::response(['issuer' => 'https://attacker.example.com',
            'authorization_endpoint' => 'https://auth.example.com/authorize', 'token_endpoint' => 'https://auth.example.com/token',
            'code_challenge_methods_supported' => ['S256']]));
        $this->add('https://mcp.example.com/mcp')->assertStatus(422);
        $this->assertSame(0, $this->hits('auth.example.com') - collect(Http::recorded())->filter(fn ($p) => str_contains($p[0]->url(), '/.well-known/'))
            ->filter(fn ($p) => parse_url($p[0]->url(), PHP_URL_HOST) === 'auth.example.com')->count(), 'Nothing but metadata was fetched.');
    }

    public function test_unsupported_versions_and_oversized_answers_are_refused(): void
    {
        $this->mcpVersion = '2024-11-05';
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
        $this->mcpVersion = '2025-11-25';
        config(['agents_v2_mcp.max_response_bytes' => 2000]);
        $this->mcpTools[0]['description'] = str_repeat('x', 3000);
        $this->add('https://mcp.example.com/mcp')->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
    }

    public function test_an_expiring_token_is_refreshed_with_the_resource_and_a_refused_refresh_asks_for_sign_in(): void
    {
        $this->withOAuth();
        $added = $this->add('https://mcp.example.com/mcp')->assertCreated()->json();
        $q = $this->queryOf($this->openSignIn($added['signIn']['url']));
        $this->get('/api/agents/v2/mcp/callback?state='.$q['state'].'&code=c1');
        [$conn, $slug] = [$added['connection']['id'], $added['server']['provider']];
        DB::table('agent_connections')->where('id', $conn)->update(['expires_at' => now()->addSeconds(30)]);
        $this->putJson('/api/agents/v2/mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__search_docs']])->assertOk();
        $this->grant($conn, [$slug.'__search_docs']);
        $this->admit('Search.');
        $claimed = $this->claim();
        $this->callTool($claimed, $slug.'__search_docs', $conn, ['query' => 'a'], 'r1')->assertOk()->assertJsonPath('action.state', 'completed');
        Http::assertSent(fn ($r) => $r->url() === 'https://auth.example.com/token' && $r['grant_type'] === 'refresh_token'
            && $r['refresh_token'] === 'rt-1' && $r['resource'] === 'https://mcp.example.com/mcp');
        DB::table('agent_connections')->where('id', $conn)->update(['expires_at' => now()->subMinute()]);
        $this->on('#^https://auth\.example\.com/token$#', Http::response(['error' => 'invalid_grant'], 400));
        $this->callTool($claimed, $slug.'__search_docs', $conn, ['query' => 'b'], 'r2')->assertOk()
            ->assertJsonPath('action.result.outcome', 'reconnect_required');
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'reconnect_required');
    }

    /** F-01: the victim approves a sign-in link the attacker started; nothing is exchanged and the attacker gets no token. */
    public function test_a_victim_who_approves_the_attackers_mcp_sign_in_connects_nothing(): void
    {
        $this->withOAuth();
        $added = $this->add('https://mcp.example.com/mcp')->assertCreated()->json();
        $q = $this->queryOf($this->providerPageWithoutCookie($added['signIn']['url']));
        $this->flushHeaders();
        $this->get('/api/agents/v2/mcp/callback?state='.$q['state'].'&code=victim-code')->assertOk()->assertSee('was not connected');
        Http::assertNotSent(fn ($r) => $r->url() === 'https://auth.example.com/token');
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$added['signIn']['flowId'])->assertJsonPath('status', 'failed');
    }
}
