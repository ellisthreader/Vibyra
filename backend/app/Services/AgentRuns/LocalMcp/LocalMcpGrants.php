<?php

namespace App\Services\AgentRuns\LocalMcp;

use App\Models\AgentV2\{Connection, Grant, McpServer, Run};

/**
 * Which runs may be offered a local server's tools: only a run on the Mac that runs that server (the runtime
 * snapshot's `hostId`), whose app declares `capabilities.localMcp`, for a teammate that holds a grant, while the
 * flag is on and the server is registered and not removed. The grant itself is the ordinary per-teammate
 * `PUT agents/{id}/grants/{connectionId}`; nothing here creates one.
 */
final class LocalMcpGrants
{
    public static function server(Connection $connection): ?McpServer
    {
        return McpServer::query()->where('connection_id', $connection->id)->where('kind', 'local')
            ->where('status', '!=', 'removed')->first();
    }

    public static function usable(Run $run, Connection $connection): bool
    {
        if (!config('agents_v2_local_mcp.enabled')) return false;
        $server = self::server($connection);
        $runtime = $run->runtime_snapshot ?? [];
        return $server !== null && (int) $server->user_id === (int) $run->user_id
            && hash_equals((string) $server->host_id, (string) ($runtime['hostId'] ?? ''))
            && (($runtime['capabilities']['localMcp'] ?? false) === true)
            && Grant::query()->where('connection_id', $connection->id)->where('agent_id', $run->agent_id)
                ->whereNull('revoked_at')->exists();
    }
}
