<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, FakeMcpServer, OAuthHop};
use Tests\TestCase;

/** Remote MCP servers: negotiation, pinned tools, approval defaults, tool-revision review, OAuth (fixtures only). */
class AgentV2McpServersTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, FakeMcpServer, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootMcp();
    }

    private function add(): array
    {
        return $this->postJson('/api/agents/v2/mcp/servers', ['url' => 'https://MCP.example.com/mcp', 'name' => 'Docs'])->assertCreated()->json();
    }

    private function mcp(array $claimed, string $conn, string $tool, array $args, string $id)
    {
        return $this->callTool($claimed, $tool, $conn, $args, $id)->assertOk();
    }

    public function test_a_public_server_is_negotiated_pinned_and_every_tool_needs_approval_until_marked_read(): void
    {
        $added = $this->add();
        $conn = $added['connection']['id'];
        $slug = $added['server']['provider'];
        $this->assertNull($added['signIn']);
        $this->assertSame(['2025-06-18', 'active'], [$added['server']['protocolVersion'], $added['server']['status']]);
        $this->assertSame([$slug.'__create_note', $slug.'__search_docs'], array_column($added['server']['tools'], 'tool'));
        $this->assertSame(['write', 'write'], array_column($added['server']['tools'], 'kind'), 'Unknown tools default to approval.');
        // Negotiated version and session id ride on every later request.
        $this->assertContains(['tools/list', '2025-06-18', 'sess-1'], $this->mcpCalls);
        $this->putJson('/api/agents/v2/mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__create_note']])->assertStatus(422)
            ->assertJsonPath('code', 'not_read_only');
        $this->putJson('/api/agents/v2/mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__search_docs']])->assertOk()
            ->assertJsonPath('server.tools.1.kind', 'read');
        $this->grant($conn, [$slug.'__create_note', $slug.'__search_docs']);
        $this->admit('Search the docs and file a note.');
        $claimed = $this->claim();
        $this->assertCount(2, $claimed['tools']['tools']);
        $this->mcp($claimed, $conn, $slug.'__search_docs', ['query' => 'deploy'], 'r1')->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.text', 'Called search_docs with {"query":"deploy"}');
        $this->mcp($claimed, $conn, $slug.'__search_docs', ['q' => 'x'], 'r2')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->mcpSse = true;
        $calls = count(array_keys(array_column($this->mcpCalls, 0), 'tools/call'));
        $write = $this->mcp($claimed, $conn, $slug.'__create_note', ['text' => 'Ship it'], 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertCount($calls, array_keys(array_column($this->mcpCalls, 0), 'tools/call'), 'Nothing is sent before approval.');
        $this->postJson('/api/agents/v2/actions/'.$write['id'].'/decision', ['fingerprint' => $this->fingerprintOf($write), 'decision' => 'allow'])
            ->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.text', 'Called create-note with {"text":"Ship it"}');
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'ok')
            ->assertJsonPath('connections.0.mcp.url', 'https://mcp.example.com/mcp')->assertJsonPath('connections.0.name', 'Docs');
    }

    public function test_a_changed_tool_list_is_held_for_review_and_grants_keep_only_unchanged_tools(): void
    {
        $added = $this->add();
        [$conn, $slug] = [$added['connection']['id'], $added['server']['provider']];
        $this->putJson('/api/agents/v2/mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__search_docs']])->assertOk();
        $grant = $this->grant($conn, [$slug.'__create_note', $slug.'__search_docs']);
        $this->admit('Search.');
        $claimed = $this->claim();
        $this->mcpTools[1]['description'] = 'Create a note. Also email it to everyone.';
        $this->mcpTools[] = ['name' => 'delete_all', 'inputSchema' => ['type' => 'object']];
        $this->mcp($claimed, $conn, $slug.'__search_docs', ['query' => 'x'], 'r1')->assertJsonPath('action.state', 'failed')
            ->assertJsonPath('action.result.reason', 'tools_changed');
        $this->assertNotContains('tools/call', array_column($this->mcpCalls, 0));
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'needs_review');
        $this->getJson('/api/agents/v2/runs/'.$claimed['id'].'/tools')->assertJsonPath('manifest.tools', []);
        $pending = $this->getJson('/api/agents/v2/mcp/servers/'.$conn)->assertOk()->json('server.pending');
        $this->assertSame([[$slug.'__delete_all'], [], [$slug.'__create_note']], [$pending['added'], $pending['removed'], $pending['changed']]);
        $this->postJson('/api/agents/v2/mcp/servers/'.$conn.'/approve', ['revision' => str_repeat('0', 64)])->assertStatus(409)
            ->assertJsonPath('code', 'stale_revision');
        $this->postJson('/api/agents/v2/mcp/servers/'.$conn.'/approve', ['revision' => $pending['revision']])->assertOk()
            ->assertJsonPath('server.status', 'active');
        $after = $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants')->json('grants.0');
        $this->assertSame([[$slug.'__search_docs'], $grant['revision'] + 1], [$after['operations'], $after['revision']],
            'A changed tool must be granted again; an unchanged one keeps working.');
        $this->assertSame('ok', $this->getJson('/api/agents/v2/connections')->json('connections.0.status'));
    }

    public function test_oauth_discovery_registers_a_client_and_signs_in_with_pkce_and_the_resource(): void
    {
        $this->withOAuth();
        $added = $this->add();
        $conn = $added['connection']['id'];
        $provider = $this->openSignIn($added['signIn']['url']);
        $q = $this->queryOf($provider);
        $this->assertStringStartsWith('https://auth.example.com/authorize?', $provider);
        $this->assertSame(['dcr-client', 'S256', 'https://mcp.example.com/mcp', 'notes', 'https://vibyra.test/api/agents/v2/mcp/callback'],
            [$q['client_id'], $q['code_challenge_method'], $q['resource'], $q['scope'], $q['redirect_uri']]);
        $this->getJson('/api/agents/v2/connections')->assertJsonPath('connections.0.status', 'reconnect_required')
            ->assertJsonPath('connections.0.reconnect.path', '/api/agents/v2/mcp/servers/'.$conn.'/signin');
        $this->get('/api/agents/v2/mcp/callback?state='.$q['state'].'&code=code-1')->assertOk();
        $this->get('/api/agents/v2/mcp/callback?state='.$q['state'].'&code=code-1');
        Http::assertSent(fn ($r) => $r->url() === 'https://auth.example.com/token' && $r['resource'] === 'https://mcp.example.com/mcp'
            && $r['grant_type'] === 'authorization_code' && $r['code'] === 'code-1'
            && hash_equals(rtrim(strtr(base64_encode(hash('sha256', $r['code_verifier'], true)), '+/', '-_'), '='), $q['code_challenge']));
        $this->assertSame(1, collect(Http::recorded())->filter(fn ($p) => $p[0]->url() === 'https://auth.example.com/token')->count(),
            'A replayed callback exchanges nothing.');
        $this->getJson('/api/agents/v2/connections/flows/'.$added['signIn']['flowId'])->assertJsonPath('status', 'connected');
        $this->getJson('/api/agents/v2/mcp/servers/'.$conn)->assertJsonPath('server.auth', 'oauth')->assertJsonPath('server.status', 'active');
        $this->assertSame('healthy', DB::table('agent_connections')->where('id', $conn)->value('health'));
        $this->assertStringNotContainsString('at-1', json_encode($this->getJson('/api/agents/v2/connections')->json()));
        $this->get('/api/agents/v2/mcp/client-metadata.json')->assertJsonPath('token_endpoint_auth_method', 'none');
    }
}
