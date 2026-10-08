<?php

namespace App\Services\AgentRuns\Connections;

use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\Composio\ComposioApi;
use App\Services\ChatConnectors\{Registry, Revocable};
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * Removing a connection from the hub: every grant on it is revoked and the stored
 * credential is dropped (`Connections::revoke`). A remote MCP server forgets its
 * OAuth client and tokens; a Composio account is also deleted at Composio, best
 * effort, after local access has already ended.
 */
final class Disconnect
{
    public function __construct(private readonly Connections $connections, private readonly ComposioApi $composio,
        private readonly Registry $registry) {}

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
        // Install-backed accounts already revoke upstream through Installs. Extra accounts must do the same.
        if (!$row->install_id && $row->credential && $this->registry->has($row->provider)) {
            try {
                $connector = $this->registry->for($row->provider);
                if ($connector instanceof Revocable) $connector->revoke(Crypt::decryptString($row->credential));
            } catch (\Throwable) {
                Log::warning('Connector upstream disconnect failed', ['provider' => $row->provider]);
            }
        }
    }
}
