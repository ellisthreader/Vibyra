<?php

namespace App\Services\AgentRuns\Connections;

use App\Models\AgentV2\Connection;
use App\Services\ChatConnectors\ConnectorOAuth;
use App\Services\ChatConnectors\Installs;
use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * The credential for one broker call, decrypted only for that call. It is never
 * returned to a client, a runner, a model or an event.
 */
final class Credentials
{
    public function __construct(private readonly Installs $installs, private readonly ConnectorOAuth $oauth) {}

    public function for(Connection $row): string
    {
        return DB::transaction(function () use ($row) {
            // Serialize refresh per connection so two calls never spend one refresh token twice.
            $fresh = Connection::query()->whereKey($row->id)->lockForUpdate()->first();
            if (!$fresh || $fresh->revoked_at || $fresh->health !== 'healthy'
                || $fresh->generation !== $row->generation || $fresh->user_id !== $row->user_id
                || $fresh->provider !== $row->provider || $fresh->install_id !== $row->install_id
                || $fresh->external_identity !== $row->external_identity)
                throw \App\Services\AgentRuns\Tools\Providers\ToolFailure::refused('access_changed', 'Access changed before this action ran. Prepare it again.');
            if ($fresh->install_id) return $this->installs->credential($fresh->user_id, $fresh->provider, [
                'id' => $fresh->install_id, 'account_label' => $fresh->external_identity,
                'connected_at' => $fresh->install_connected_at?->format('Y-m-d H:i:s'),
            ]);
            if (!$fresh->credential) throw ReconnectRequired::for($fresh->provider);
            // A remote MCP server refreshes with its own authorization server, under this same connection lock.
            if (str_starts_with($fresh->provider, 'mcp_')) return app(\App\Services\AgentRuns\Mcp\McpTokens::class)->credential($fresh);
            if (!$fresh->refresh_token || !$fresh->expires_at || !$this->oauth->renewable($fresh->provider)
                || $fresh->expires_at->isAfter(now()->addMinutes(\App\Services\ChatConnectors\ConnectorTokens::renewalMarginMinutes($fresh->provider)))) {
                return Crypt::decryptString($fresh->credential);
            }
            $grant = $this->oauth->renew($fresh->provider, Crypt::decryptString($fresh->refresh_token));
            if (!$grant) return Crypt::decryptString($fresh->credential);
            $fresh->forceFill(['credential' => Crypt::encryptString($grant['access']),
                'refresh_token' => is_string($grant['refresh'] ?? null) ? Crypt::encryptString($grant['refresh']) : $fresh->refresh_token,
                'expires_at' => is_int($grant['expires_in'] ?? null) ? now()->addSeconds($grant['expires_in']) : null])->save();
            return $grant['access'];
        });
    }
}
