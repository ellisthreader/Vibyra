<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/** A local (stdio) MCP server as the Mac registers it, plus the leased runner's local-mcp endpoints (fixtures, no real process). */
trait AgentV2LocalMcpFixture
{
    protected string $localId = '5f0c1d2e-aaaa-4bbb-8ccc-0123456789ab';

    protected function bootLocalMcp(bool $capable = true, ?string $hostId = null): void
    {
        config(['agents_v2_local_mcp.enabled' => true]);
        $this->runtime = $this->postJson('/api/agents/v2/runtimes', ['hostId' => $hostId ?? $this->hostId, 'provider' => 'claude',
            'accountRef' => 'default', 'model' => 'claude-sonnet', 'capabilities' => ['controlledTools' => true, 'localMcp' => $capable]])
            ->assertCreated()->json('runtime');
    }

    protected function catalogue(): array
    {
        return [
            ['name' => 'read_file', 'description' => 'Read a file.', 'inputSchema' => ['type' => 'object',
                'properties' => ['path' => ['type' => 'string']], 'required' => ['path']], 'annotations' => ['readOnlyHint' => true]],
            ['name' => 'write_file', 'description' => 'Write a file.', 'inputSchema' => ['type' => 'object',
                'properties' => ['path' => ['type' => 'string'], 'content' => ['type' => 'string']], 'required' => ['path', 'content']],
                'annotations' => ['destructiveHint' => true]],
            ['name' => 'list_dir', 'description' => 'List a folder.', 'inputSchema' => ['type' => 'object',
                'properties' => ['path' => ['type' => 'string']]], 'annotations' => ['readOnlyHint' => true]],
        ];
    }

    protected function registerLocal(?array $tools = null, ?string $localId = null, array $extra = [])
    {
        return $this->postJson('/api/agents/v2/local-mcp/servers', ['hostId' => $this->hostId, 'localId' => $localId ?? $this->localId,
            'name' => 'Project files', 'tools' => $tools ?? $this->catalogue()] + $extra);
    }

    /** @return array{0: string, 1: string} connection id and tool-name slug */
    protected function localServer(array $reads = [], ?array $grant = ['read_file', 'write_file', 'list_dir']): array
    {
        $server = $this->registerLocal()->assertSuccessful()->json('server');
        [$conn, $slug] = [$server['connectionId'], $server['provider']];
        if ($reads !== []) $this->putJson('/api/agents/v2/local-mcp/servers/'.$conn.'/reads', ['tools' => array_map(fn ($t) => $slug.'__'.$t, $reads)])->assertOk();
        if ($grant !== null) $this->grant($conn, array_map(fn ($t) => $slug.'__'.$t, $grant));
        return [$conn, $slug];
    }

    protected function localPath(array $claimed, string $suffix = ''): string
    {
        return $this->runnerPath('/runs/'.$claimed['id'].'/local-mcp'.$suffix);
    }

    protected function localList(array $claimed)
    {
        return $this->getJson($this->localPath($claimed, '?generation='.$claimed['generation']), $this->runnerHeaders());
    }

    protected function localClaim(array $claimed, array $action, ?array $live = null, ?int $generation = null)
    {
        $fingerprint = DB::table('agent_tool_actions')->where('id', $action['id'])->value('fingerprint');
        return $this->postJson($this->localPath($claimed, '/'.$action['id'].'/claim'), ['generation' => $generation ?? $claimed['generation'],
            'fingerprint' => $fingerprint, 'tools' => $live ?? $this->catalogue()], $this->runnerHeaders());
    }

    protected function localReceipt(array $claimed, string $actionId, array $result, ?int $generation = null)
    {
        return $this->postJson($this->localPath($claimed, '/'.$actionId.'/receipt'),
            ['generation' => $generation ?? $claimed['generation'], 'result' => $result], $this->runnerHeaders());
    }

    /** Claim then answer one approved local action, as the Rust runner does. */
    protected function localRun(array $claimed, array $action, array $result)
    {
        $this->localClaim($claimed, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        return $this->localReceipt($claimed, $action['id'], $result);
    }
}
