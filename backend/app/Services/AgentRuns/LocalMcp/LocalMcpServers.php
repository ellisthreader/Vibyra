<?php

namespace App\Services\AgentRuns\LocalMcp;

use App\Models\AgentV2\{Connection, McpServer};
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Mcp\{McpPayload, McpServers, ToolList};
use Illuminate\Support\Facades\DB;

/**
 * The Mac's registration of a local MCP server: an opaque id of its own (`localId`), a display name and the tool
 * catalogue it listed. The command line, arguments, working folder and environment never reach this service.
 * The first catalogue is pinned; a later different one is held for review (connection `needs_review`, no tools
 * in any manifest) until the person approves it, exactly like a remote server's tool change.
 */
final class LocalMcpServers
{
    public function __construct(private readonly McpServers $servers) {}

    public static function enabled(): bool
    {
        return (bool) config('agents_v2_local_mcp.enabled');
    }

    public function register(int $userId, string $hostId, string $localId, string $name, array $rawTools): McpServer
    {
        if (!self::enabled()) ApiError::throw(409, 'provider_unavailable', 'Local MCP servers are not switched on yet.');
        return DB::transaction(function () use ($userId, $hostId, $localId, $name, $rawTools) {
            // The cap is a count and a first registration has no row to lock: count and create under the user row lock.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $server = McpServer::query()->where('user_id', $userId)->where('host_id', $hostId)->where('local_id', $localId)->first();
            if ($server?->status === 'removed') ApiError::throw(409, 'server_removed', 'This server was removed. Add it again.');
            $name = mb_substr(trim($name) ?: 'Local server', 0, 80);
            if (!$server) return $this->create($userId, $hostId, $localId, $name, $rawTools);
            $row = Connection::query()->whereKey($server->connection_id)->lockForUpdate()->firstOrFail();
            $server->forceFill(['name' => $name, 'last_seen_at' => now()])->save();
            $row->forceFill(['external_identity' => $name])->save();
            $this->servers->observe($server, $row, ToolList::normalise($rawTools, $server->slug));
            return $server->fresh();
        });
    }

    private function create(int $userId, string $hostId, string $localId, string $name, array $rawTools): McpServer
    {
        $count = McpServer::query()->where('user_id', $userId)->where('kind', 'local')->where('status', '!=', 'removed')
            ->whereIn('connection_id', Connection::query()->select('id')->where('user_id', $userId)->whereNull('revoked_at'))->count();
        if ($count >= (int) config('agents_v2_local_mcp.max_servers', 10)) ApiError::throw(409, 'limit_reached', 'Remove a local server before adding another.');
        $slug = $this->slug();
        $live = ToolList::normalise($rawTools, $slug);
        $row = Connection::query()->create(['user_id' => $userId, 'provider' => $slug, 'external_identity' => $name,
            'health' => 'healthy', 'generation' => 1, 'capability_revision' => 1]);
        $server = McpServer::query()->create(['user_id' => $userId, 'connection_id' => $row->id, 'slug' => $slug, 'url' => 'local:'.$localId,
            'name' => $name, 'kind' => 'local', 'host_id' => $hostId, 'local_id' => $localId, 'status' => 'active', 'last_seen_at' => now(),
            'tools' => $live['tools'], 'tool_revision' => $live['revision']]);
        \App\Services\Platform\AccountActivity::record($userId, 'mcp_server.added', ['name' => $name, 'kind' => 'local']);
        return $server;
    }

    private function slug(): string
    {
        do $slug = LocalMcpTools::PREFIX.bin2hex(random_bytes(4));
        while (McpServer::query()->where('slug', $slug)->exists());
        return $slug;
    }

    /** @return McpServer[] */
    public function list(int $userId, ?string $hostId = null): array
    {
        $query = McpServer::query()->where('user_id', $userId)->where('kind', 'local')->where('status', '!=', 'removed')->orderBy('name');
        if ($hostId) $query->where('host_id', $hostId);
        return $query->get()->all();
    }

    public function find(int $userId, string $connectionId): McpServer
    {
        $server = McpServer::query()->where('user_id', $userId)->where('connection_id', $connectionId)->where('kind', 'local')
            ->where('status', '!=', 'removed')->first();
        if (!$server) ApiError::throw(404, 'connection_not_found', 'That local server does not exist.');
        return $server;
    }

    public function payload(McpServer $s): array
    {
        $adapter = new LocalMcpTools($s);
        $health = Connection::query()->whereKey($s->connection_id)->value('health');
        return ['connectionId' => $s->connection_id, 'serverId' => $s->id, 'provider' => $s->slug, 'name' => $s->name, 'hostId' => $s->host_id,
            'localId' => $s->local_id, 'status' => $s->status, 'health' => $health, 'toolRevision' => $s->tool_revision,
            'lastSeenAt' => $s->last_seen_at ? \Illuminate\Support\Carbon::parse($s->last_seen_at)->toIso8601String() : null,
            'tools' => McpPayload::tools($s, $adapter), 'pending' => McpPayload::pending($s, $adapter)];
    }
}
