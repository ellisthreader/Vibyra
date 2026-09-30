<?php

namespace App\Services\AgentRuns\Connections;

use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\Composio\ComposioApi;
use Illuminate\Support\Facades\Crypt;

/**
 * Removing a connection from the hub: every grant on it is revoked and the stored
 * credential is dropped (`Connections::revoke`). A remote MCP server forgets its
 * OAuth client and tokens; a Composio account is also deleted at Composio, best
 * effort, after local access has already ended.
 */
final class Disconnect
{
    public function __construct(private readonly Connections $connections, private readonly ComposioApi $composio) {}

    public function remove(int $userId, string $id): void
    {
        $row = $this->connections->find($userId, $id);
        if ($row->revoked_at) return;
        $account = null;
        if (str_starts_with($row->provider, 'composio_') && $row->credential) {
            $credential = rescue(fn () => Crypt::decryptString($row->credential), '', false);
            $account = preg_match('/^u\d+:([A-Za-z0-9_-]{4,80})$/D', $credential, $m) ? $m[1] : null;
        }
        $this->connections->revoke($userId, $id);
        McpServer::query()->where('connection_id', $row->id)->update(['oauth' => null, 'status' => 'removed', 'updated_at' => now()]);
        if ($account) $this->composio->disconnect($account);
    }
}
