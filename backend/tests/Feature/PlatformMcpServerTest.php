<?php

namespace Tests\Feature;

use App\Services\Platform\Mcp\{Server, ServerTools};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** Roadmap Part 11: Vibyra as a remote MCP server, authenticated by an API key and limited to its scopes. */
class PlatformMcpServerTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['platform.api_keys' => true, 'platform.mcp_server' => true]);
    }

    private function key(array $scopes): string
    {
        $secret = $this->actingAs($this->user)->withToken('')->postJson('/web-api/developer/keys', ['name' => 'mcp', 'scopes' => $scopes])->assertCreated()->json('secret');
        $this->app['auth']->forgetGuards();
        return $secret;
    }

    private function rpc(string $secret, array $message, array $headers = [])
    {
        if (($headers['MCP-Protocol-Version'] ?? null) === '2026-07-28') {
            $message['params']['_meta'] = ['io.modelcontextprotocol/protocolVersion' => '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities' => new \stdClass];
        }
        return $this->withToken($secret)->postJson('/api/platform/mcp', $message, $headers);
    }

    private function tool(string $secret, string $tool, array $args = [], int $id = 7)
    {
        return $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => $id, 'method' => 'tools/call', 'params' => ['name' => $tool, 'arguments' => $args]]);
    }

    public function test_it_needs_a_valid_key_and_answers_only_while_switched_on(): void
    {
        $secret = $this->key(['runs:read']);
        $ping = ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'];
        $this->rpc('vyk_'.str_repeat('b', 40), $ping)->assertUnauthorized();
        $this->rpc('v2-session', $ping)->assertUnauthorized();
        $this->rpc($secret, $ping)->assertOk()->assertJsonPath('result', []);
        $this->withToken($secret)->getJson('/api/platform/mcp')->assertStatus(405)->assertHeader('Allow', 'POST');
        config(['platform.mcp_server' => false]);
        $this->rpc($secret, $ping)->assertNotFound();
    }

    public function test_the_older_initialize_handshake_is_answered(): void
    {
        $secret = $this->key(['runs:read']);
        $r = $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'initialize', 'params' => ['protocolVersion' => '2025-03-26',
            'capabilities' => new \stdClass, 'clientInfo' => ['name' => 'test', 'version' => '1']]])->assertOk();
        $r->assertJsonPath('result.protocolVersion', '2025-03-26')->assertJsonPath('result.serverInfo.name', 'Vibyra')
            ->assertJsonPath('result.capabilities.tools.listChanged', false)->assertHeaderMissing('Mcp-Session-Id');
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 2, 'method' => 'initialize', 'params' => ['protocolVersion' => '1999-01-01']])
            ->assertJsonPath('result.protocolVersion', '2025-11-25');
        $this->rpc($secret, ['jsonrpc' => '2.0', 'method' => 'notifications/initialized'])->assertStatus(202)->assertSee('', false);
    }

    public function test_the_stateless_style_needs_no_handshake_and_no_session(): void
    {
        $secret = $this->key(['runs:read']);
        $h = ['MCP-Protocol-Version' => '2026-07-28'];
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 'a', 'method' => 'tools/list'], $h)->assertOk()->assertJsonPath('id', 'a')->assertJsonCount(2, 'result.tools');
        $d = $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 'b', 'method' => 'server/discover'], $h)->assertOk();
        $this->assertSame('Vibyra', $d->json('result')['_meta']['io.modelcontextprotocol/serverInfo']['name']);
        $d->assertJsonPath('result.supportedVersions.0', '2026-07-28')->assertHeaderMissing('Mcp-Session-Id');
        $d->assertJsonPath('result.resultType', 'complete')->assertHeader('MCP-Protocol-Version', '2026-07-28');
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 'c', 'method' => 'tools/list'], ['MCP-Protocol-Version' => '1999-01-01'])->assertStatus(400);
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 'd', 'method' => 'resources/list'], $h)->assertJsonPath('error.code', -32601);
        $this->call('POST', '/api/platform/mcp', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$secret], '{nope')->assertStatus(400)->assertJsonPath('error.code', -32700);
        $this->rpc($secret, [['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'], ['jsonrpc' => '2.0', 'id' => 2, 'method' => 'ping']])->assertStatus(400);
    }

    public function test_modern_envelope_errors_never_fall_back_or_dispatch_tools(): void
    {
        $secret = $this->key(['runs:read']);
        $message = ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'];
        $this->withToken($secret)->postJson('/api/platform/mcp', $message, ['MCP-Protocol-Version' => '2026-07-28'])
            ->assertStatus(400)->assertJsonPath('error.code', -32602);
        foreach (['invalid', 42, ['io.modelcontextprotocol/protocolVersion' => '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities' => ['invalid']]] as $malformed) {
            $message['params']['_meta'] = $malformed;
            $this->withToken($secret)->postJson('/api/platform/mcp', $message, ['MCP-Protocol-Version' => '2026-07-28'])
                ->assertStatus(400)->assertJsonPath('error.code', -32602);
        }
        $message['params']['_meta'] = ['io.modelcontextprotocol/protocolVersion' => '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities' => new \stdClass];
        foreach (['MCP-Protocol-Version' => '2025-11-25', 'MCP-Method' => 'tools/call', 'MCP-Param-Name' => 'invented'] as $header => $value)
            $this->withToken($secret)->postJson('/api/platform/mcp', $message, [$header => $value])->assertStatus(400)->assertJsonPath('error.code', -32020);
        $message['params']['_meta']['io.modelcontextprotocol/protocolVersion'] = '2099-01-01';
        $this->withToken($secret)->postJson('/api/platform/mcp', $message)->assertStatus(400)->assertJsonPath('error.code', -32022);
        $this->assertSame(0, DB::table('agent_runs')->count());
    }

    public function test_tools_follow_the_keys_scopes_and_their_descriptions_are_fixed(): void
    {
        $all = $this->key(['runs:read', 'runs:create', 'projects:read']);
        $tools = collect($this->rpc($all, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'])->json('result.tools'))->keyBy('name');
        $this->assertSame(['get_run', 'list_projects', 'list_runs', 'start_run'], $tools->keys()->sort()->values()->all());
        foreach (ServerTools::TOOLS as $name => $def) $this->assertSame($def['description'], $tools[$name]['description']);
        $this->assertSame('0a66404f9f441de9b07fc807ddf2ec27', substr(md5(json_encode($tools->map(fn ($t) => [$t['name'], $t['description']])->sortKeys()->all())), 0, 32),
            'Tool descriptions are part of the contract: change them on purpose, with this fixture.');
        $this->assertStringContainsString('cannot approve anything', $tools['start_run']['description']);
        $this->assertSame(['get_run', 'list_runs', 'start_run'], $this->names($this->key(['runs:read', 'runs:create'])));
        $this->assertSame(['get_run', 'list_runs'], $this->names($this->key(['runs:read'])));
        $this->assertSame(['list_projects'], $this->names($this->key(['projects:read'])));
        $this->assertSame([], $this->names($this->key(['triggers:invoke'])));
        foreach (array_keys(ServerTools::TOOLS) as $name) $this->assertDoesNotMatchRegularExpression('/approv|decid|billing|key/i', $name);
    }

    private function names(string $secret): array
    {
        $this->app['auth']->forgetGuards();
        return collect($this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'])->json('result.tools'))->pluck('name')->sort()->values()->all();
    }

    public function test_a_tool_outside_the_keys_scope_is_refused_and_there_is_no_approval_tool(): void
    {
        $secret = $this->key(['runs:read']);
        $run = $this->withToken('v2-session')->admit();
        $denied = $this->tool($secret, 'start_run', ['prompt' => 'Sneak a run in'])->assertOk();
        $denied->assertJsonPath('result.isError', true);
        $this->assertStringContainsString('runs:create', $denied->json('result.content.0.text'));
        $this->assertSame(1, DB::table('agent_runs')->count());
        foreach (['approve_action', 'decide', 'list_connections', 'create_api_key'] as $name) $this->tool($secret, $name)->assertJsonPath('result.isError', true);
        $this->tool($secret, 'list_projects')->assertJsonPath('result.isError', true);
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call', 'params' => []])->assertJsonPath('error.code', -32602);
        $this->assertNotNull($run);
    }

    public function test_read_tools_return_the_accounts_own_runs_and_projects(): void
    {
        $secret = $this->key(['runs:read', 'projects:read']);
        $run = $this->withToken('v2-session')->admit('Check the build');
        DB::table('cloud_sync_projects')->insert(['user_id' => $this->user->id, 'project_key' => str_repeat('a', 32), 'name' => 'Acme', 'state' => 'synced', 'created_at' => now(), 'updated_at' => now()]);
        $other = \App\Models\User::factory()->create();
        DB::table('cloud_sync_projects')->insert(['user_id' => $other->id, 'project_key' => str_repeat('b', 32), 'name' => 'Theirs', 'state' => 'synced', 'created_at' => now(), 'updated_at' => now()]);
        $list = json_decode($this->tool($secret, 'list_runs')->json('result.content.0.text'), true);
        $this->assertSame([$run['id']], array_column($list['runs'], 'id'));
        $one = json_decode($this->tool($secret, 'get_run', ['runId' => $run['id']])->json('result.content.0.text'), true);
        $this->assertSame('Check the build', $one['run']['prompt']);
        $this->tool($secret, 'get_run', ['runId' => 'nope'])->assertJsonPath('result.isError', true);
        $projects = json_decode($this->tool($secret, 'list_projects')->json('result.content.0.text'), true);
        $this->assertSame(['Acme'], array_column($projects['projects'], 'name'));
    }

    public function test_start_run_admits_through_the_normal_path_once_per_idempotency_key(): void
    {
        $secret = $this->key(['runs:create']);
        $a = json_decode($this->tool($secret, 'start_run', ['prompt' => 'Ship it', 'idempotencyKey' => 'mcp-call-0001'])->json('result.content.0.text'), true);
        $b = json_decode($this->tool($secret, 'start_run', ['prompt' => 'Ship it', 'idempotencyKey' => 'mcp-call-0001'])->json('result.content.0.text'), true);
        $this->assertSame($a['run']['id'], $b['run']['id']);
        $this->assertTrue($b['replayed']);
        $this->assertSame(1, DB::table('agent_runs')->count());
        $this->assertSame('queued', $a['run']['state']);
        $this->tool($secret, 'start_run', ['prompt' => ''])->assertJsonPath('result.isError', true);
    }

    public function test_each_http_request_spends_the_keys_budget(): void
    {
        $secret = $this->actingAs($this->user)->withToken('')->postJson('/web-api/developer/keys', ['name' => 'slow', 'scopes' => ['runs:read'], 'ratePerMinute' => 2])->json('secret');
        $this->app['auth']->forgetGuards();
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'])->assertOk();
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'])->assertOk();
        $this->rpc($secret, ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'])->assertStatus(429);
        $this->assertContains('2026-07-28', Server::VERSIONS);
    }
}
