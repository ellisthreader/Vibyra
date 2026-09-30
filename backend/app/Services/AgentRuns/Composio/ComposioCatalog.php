<?php

namespace App\Services\AgentRuns\Composio;

/**
 * The reviewed Composio toolkits (config/agents_v2_composio.php) and whether each
 * may be used in this environment. Also the per-account Composio `user_id`: an
 * opaque, keyed value, so one Vibyra account can never name another's
 * connected accounts by guessing.
 */
final class ComposioCatalog
{
    public function toolkits(): array
    {
        return (array) config('agents_v2_composio.toolkits', []);
    }

    public function has(string $toolkit): bool
    {
        return isset($this->toolkits()[$toolkit]);
    }

    public function spec(string $toolkit): array
    {
        return (array) ($this->toolkits()[$toolkit] ?? []);
    }

    /** The reviewed tool entry for a V2 tool name `composio_<toolkit>__<name>`, or null. */
    public function tool(string $toolkit, string $v2Name): ?array
    {
        $prefix = 'composio_'.$toolkit.'__';
        if (!str_starts_with($v2Name, $prefix)) return null;
        $tool = $this->spec($toolkit)['tools'][substr($v2Name, strlen($prefix))] ?? null;
        return is_array($tool) ? $tool : null;
    }

    /** Null when the toolkit is ready; otherwise the honest reason it is not. */
    public function unavailableReason(string $toolkit): ?string
    {
        if (!$this->has($toolkit)) return 'unknown_provider';
        if ((string) config('chat_connectors.composio_api_key', '') === '') return 'credentials_missing';
        if (!config('agents_v2_composio.private_enabled')) return 'flag_off';
        if ((string) ($this->spec($toolkit)['auth_config'] ?? '') === '') return 'auth_config_missing';
        if (!config('agents_v2_composio.isolation_verified')) return 'isolation_unverified';
        return null;
    }

    public function message(string $reason): string
    {
        return match ($reason) {
            'credentials_missing' => 'The Composio API key is not set up in this environment.',
            'flag_off' => 'Composio-backed services are not switched on yet.',
            'auth_config_missing' => 'This Composio service has no auth config in this environment yet.',
            'isolation_unverified' => 'Per-account isolation for Composio has not been verified yet, so it stays off.',
            default => 'Teammates cannot use this service yet.',
        };
    }

    public function userId(int $userId): string
    {
        return 'vibyra-'.$userId.'-'.substr(hash_hmac('sha256', 'composio-user:'.$userId, (string) config('app.key')), 0, 20);
    }
}
