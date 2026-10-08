<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, FakeMcpServer, OAuthHop};
use Tests\TestCase;

/**
 * Shapes of real remote MCP servers that the live check of 2026-10-07 exposed (reproduced here over Http::fake):
 * Atlassian publishes no resource metadata (2025-03-26 flow), Netlify issues a ~525 character client_id, Vercel's
 * resource carries a trailing slash, and refusals say why. Simulated: none of this is live evidence by itself.
 */
class AgentV2McpRealServerQuirksTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, FakeMcpServer, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootMcp();
        $this->mcpAuth = true;
    }

    private function add()
    {
        return $this->postJson('/api/agents/v2/mcp/servers', ['url' => 'https://mcp.example.com/mcp', 'name' => 'Docs']);
    }

    private function authorizationServerAtTheOrigin(array $extra = []): void
    {
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-authorization-server$#', Http::response(['issuer' => 'https://mcp.example.com',
            'authorization_endpoint' => 'https://mcp.example.com/v1/authorize', 'token_endpoint' => 'https://mcp.example.com/v1/token',
            'registration_endpoint' => 'https://mcp.example.com/v1/register', 'code_challenge_methods_supported' => ['plain', 'S256'], ...$extra]));
        $this->on('#^https://mcp\.example\.com/v1/register$#', Http::response(['client_id' => 'legacy-client'], 201));
    }

    public function test_a_server_with_no_resource_metadata_signs_in_through_the_authorization_server_at_its_origin(): void
    {
        $this->authorizationServerAtTheOrigin();
        $added = $this->add()->assertCreated()->json();
        [$provider] = $this->openedFlow($added['signIn']);
        $query = [];
        parse_str((string) parse_url($provider, PHP_URL_QUERY), $query);
        $this->assertSame('https://mcp.example.com/v1/authorize', strtok($provider, '?'));
        $this->assertSame(['legacy-client', 'S256', 'https://mcp.example.com/mcp', 'https://vibyra.test/api/agents/v2/mcp/callback'],
            [$query['client_id'], $query['code_challenge_method'], $query['resource'], $query['redirect_uri']]);
        $this->assertSame('notes', $query['scope'], 'The scope still comes from the 401 challenge.');
    }

    public function test_the_origin_fallback_still_demands_a_matching_issuer_pkce_and_published_metadata(): void
    {
        $this->add()->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable')->assertJsonPath('error', 'This MCP server does not publish how to sign in to it.');
        $this->authorizationServerAtTheOrigin(['issuer' => 'https://elsewhere.example.com']);
        $this->add()->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
        $this->authorizationServerAtTheOrigin(['code_challenge_methods_supported' => ['plain']]);
        $this->add()->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable');
    }

    public function test_metadata_that_exists_is_never_replaced_by_the_origin_fallback(): void
    {
        $this->authorizationServerAtTheOrigin();
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource#', Http::response(['resource' => 'https://mcp.example.com/mcp',
            'authorization_servers' => ['https://auth.example.com']]));
        $this->on('#^https://auth\.example\.com/\.well-known/oauth-authorization-server$#', Http::response('', 404));
        $this->add()->assertStatus(422)->assertJsonPath('error', 'The sign-in server does not publish its metadata.');
    }

    public function test_a_long_self_contained_client_id_is_accepted_and_used(): void
    {
        $this->withOAuth();
        $long = str_repeat('a', 525);
        $this->on('#^https://auth\.example\.com/register$#', Http::response(['client_id' => $long], 201));
        $added = $this->add()->assertCreated()->json();
        $query = [];
        parse_str((string) parse_url($this->openedFlow($added['signIn'])[0], PHP_URL_QUERY), $query);
        $this->assertSame($long, $query['client_id']);
    }

    public function test_a_refused_registration_says_why_in_the_servers_own_words(): void
    {
        $this->withOAuth();
        $this->on('#^https://auth\.example\.com/register$#', Http::response(['error' => 'invalid_redirect_uri',
            'error_description' => "The redirect URIs are not approved.\n\x07Ask support."], 400));
        $this->add()->assertStatus(422)->assertJsonPath('code', 'mcp_unavailable')
            ->assertJsonPath('error', 'This MCP server refused to register Vibyra as an app (invalid_redirect_uri: The redirect URIs are not approved. Ask support.).');
        $this->on('#^https://auth\.example\.com/register$#', Http::response('Forbidden', 403));
        $this->add()->assertStatus(422)->assertJsonPath('error', 'This MCP server refused to register Vibyra as an app.');
    }

    public function test_a_resource_with_a_trailing_slash_on_a_bare_origin_still_matches(): void
    {
        $this->withOAuth();
        $this->on('#^https://mcp\.example\.com/?$#', Http::response('', 401, ['WWW-Authenticate' => 'Bearer']));
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource$#', Http::response(['resource' => 'https://mcp.example.com/',
            'authorization_servers' => ['https://auth.example.com'], 'scopes_supported' => ['openid']]));
        $added = $this->postJson('/api/agents/v2/mcp/servers', ['url' => 'https://mcp.example.com'])->assertCreated()->json();
        $query = [];
        parse_str((string) parse_url($this->openedFlow($added['signIn'])[0], PHP_URL_QUERY), $query);
        $this->assertSame(['https://mcp.example.com', 'openid'], [$query['resource'], $query['scope']]);
    }
}
