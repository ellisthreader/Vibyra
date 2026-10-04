<?php

namespace App\Services\AgentRuns\Connections;

use App\Services\AgentRuns\Composio\ComposioCatalog;
use App\Services\AgentRuns\Tools\Providers\Adapters;
use App\Services\ChatConnectors\ConnectorOAuth;

/**
 * Honest catalogue readiness for teammates. `ready` means a person can connect
 * this in this environment right now (integrations on, and the provider's sign-in
 * credentials present, or a pasted token accepted); anything else is
 * `unavailable` with a machine reason. Ready is not "live-verified": that is
 * recorded separately in docs/agent-integrations-master-plan.md.
 */
final class Readiness
{
    /** Providers whose V2 path also accepts a pasted personal token (POST /connections). */
    private const TOKEN_PASTE = ['github'];

    public function __construct(private readonly Adapters $adapters, private readonly ConnectorOAuth $oauth,
        private readonly ComposioCatalog $composio) {}

    /** @return array<int, array> every provider a teammate can be given, with readiness */
    public function catalogue(): array
    {
        $entries = [];
        foreach ($this->adapters->providers() as $provider) {
            $settings = (array) config('chat_connectors.catalogue.'.$provider, []);
            if ($settings === []) continue; // Not an account integration (e.g. Mac folder grants): governed by its own flags.
            $tools = $this->adapters->for($provider)->tools();
            $entries[] = ['provider' => $provider, 'name' => (string) ($settings['name'] ?? ucfirst($provider)),
                'category' => $settings['category'] ?? null, 'kind' => 'builtin',
                'connect' => in_array($provider, self::TOKEN_PASTE, true) ? ['oauth', 'token'] : ['oauth'],
                'tools' => array_map(fn ($t, $k) => ['tool' => $t, 'kind' => $k], array_keys($tools), $tools),
                ...$this->state($provider)];
        }
        $entries[] = ['provider' => 'mcp', 'name' => 'Remote MCP server', 'category' => 'Custom', 'kind' => 'mcp',
            'connect' => ['mcp_url'], 'tools' => [], ...$this->state('mcp')];
        foreach ($this->composio->toolkits() as $toolkit => $spec) {
            $entries[] = ['provider' => 'composio_'.$toolkit, 'name' => (string) ($spec['name'] ?? $toolkit), 'category' => $spec['category'] ?? null,
                'kind' => 'composio', 'connect' => ['composio'], 'tools' => array_map(fn ($t, $d) => ['tool' => 'composio_'.$toolkit.'__'.$t,
                    'kind' => $d['kind']], array_keys($spec['tools'] ?? []), $spec['tools'] ?? []), ...$this->state('composio_'.$toolkit)];
        }
        return $entries;
    }

    /** @return array{readiness: 'ready'|'unavailable', reason: ?string, message: ?string} */
    public function state(string $provider): array
    {
        // Not an account integration (e.g. Mac folder grants): governed by its own flags, not this catalogue.
        if (in_array($provider, $this->adapters->providers(), true) && config('chat_connectors.catalogue.'.$provider) === null) return $this->yes();
        // A local server needs no sign-in or connector credentials: only its own flag.
        if (preg_match('/^lmcp_[0-9a-f]{8}$/D', $provider))
            return config('agents_v2_local_mcp.enabled') ? $this->yes() : $this->no('flag_off', 'Local MCP servers are not switched on yet.');
        if (!config('chat_connectors.enabled')) return $this->no('integrations_disabled', 'Integrations are switched off in this environment.');
        if ($provider === 'mcp' || preg_match('/^mcp_[0-9a-f]{8}$/D', $provider))
            return config('agents_v2_mcp.enabled') ? $this->yes() : $this->no('flag_off', 'Remote MCP servers are not switched on yet.');
        if (str_starts_with($provider, 'composio_')) {
            $reason = $this->composio->unavailableReason(substr($provider, 9));
            return $reason ? $this->no($reason, $this->composio->message($reason)) : $this->yes();
        }
        if (!$this->adapters->has($provider)) return $this->no('unknown_provider', 'Teammates cannot use this service yet.');
        if ($this->oauth->configured($provider) || in_array($provider, self::TOKEN_PASTE, true)) return $this->yes();
        return $this->no('credentials_missing', 'Sign-in for '.(string) config('chat_connectors.catalogue.'.$provider.'.name', $provider)
            .' is not set up in this environment yet.');
    }

    private function yes(): array
    {
        return ['readiness' => 'ready', 'reason' => null, 'message' => null];
    }

    private function no(string $reason, string $message): array
    {
        return ['readiness' => 'unavailable', 'reason' => $reason, 'message' => $message];
    }
}
