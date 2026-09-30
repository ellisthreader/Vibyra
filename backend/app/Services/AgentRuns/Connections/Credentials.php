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
    private const RENEW_MARGIN_MINUTES = 60;

    public function __construct(private readonly Installs $installs, private readonly ConnectorOAuth $oauth) {}

    public function for(Connection $row): string
    {
        if ($row->install_id) return $this->installs->credential($row->user_id, $row->provider);
        if (!$row->credential) throw ReconnectRequired::for($row->provider);
        // A remote MCP server refreshes with its own authorization server, not a catalogue entry.
        if (str_starts_with($row->provider, 'mcp_')) return app(\App\Services\AgentRuns\Mcp\McpTokens::class)->credential($row);
        return DB::transaction(function () use ($row) {
            // Serialize refresh per connection so two calls never spend one refresh token twice.
            $fresh = Connection::query()->whereKey($row->id)->lockForUpdate()->firstOrFail();
            if (!$fresh->refresh_token || !$fresh->expires_at || !$this->oauth->renewable($fresh->provider)
                || $fresh->expires_at->isAfter(now()->addMinutes(self::RENEW_MARGIN_MINUTES))) {
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
