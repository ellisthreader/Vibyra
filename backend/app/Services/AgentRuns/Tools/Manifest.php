<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Grant;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Computer\{ComputerGrants, ComputerTools};
use App\Services\AgentRuns\Connections\LegacyInstalls;

/**
 * The exact tools one run may call: admission snapshot ∩ current grants ∩
 * healthy, active connections, capped. Nothing a tool returns can change it;
 * it is derived only from stored grants.
 */
final class Manifest
{
    public function __construct(private readonly ToolCatalog $catalog, private readonly ToolSelection $selection) {}

    /** The capped, task-relevant manifest (ToolSelection); `selection()` also reports what the cap dropped. */
    public function for(Run $run): array
    {
        $tools = $this->selection($run)['tools'];
        return ['revision' => substr(Canonical::hash(array_map(fn ($t) => [$t['tool'], $t['connectionId'], $t['schemaRevision']], $tools)), 0, 16),
            'tools' => $tools];
    }

    /** @return array{tools: array, dropped: array, scores: array<string, int>} */
    public function selection(Run $run): array
    {
        return $this->selection->select($run, $this->candidates($run), (int) config('agents_v2.max_tools', 10));
    }

    /** Every tool the run may call right now (snapshot ∩ current grant ∩ healthy connection), uncapped. */
    public function candidates(Run $run): array
    {
        LegacyInstalls::sync($run->user_id);
        $tools = [];
        foreach ($run->grant_snapshot ?? [] as $pinned) {
            $pair = $this->current($run, $pinned);
            if (!$pair || $pair[1]->health !== 'healthy') continue;
            [$grant, $connection] = $pair;
            $ops = array_intersect($pinned['operations'] ?? [], $grant->operations ?? [], $this->catalog->operations($connection->provider));
            foreach ($this->catalog->operations($connection->provider) as $tool) {
                if (!in_array($tool, $ops, true)) continue;
                $definition = $this->catalog->definition($tool);
                $tools[] = ['tool' => $tool, 'connectionId' => $connection->id, 'provider' => $connection->provider,
                    'account' => $connection->external_identity, 'kind' => $this->catalog->kind($tool),
                    'requiresApproval' => $this->catalog->kind($tool) === 'write',
                    'schemaRevision' => $this->catalog->schemaRevision($tool),
                    'description' => $definition['description'] ?? '', 'parameters' => $definition['parameters'] ?? (object) []];
            }
        }
        return $tools;
    }

    /**
     * The grant and connection allowing one call, or a definite refusal. Needs the
     * operation in both the admission snapshot and the current grant.
     *
     * @return array{0: Grant, 1: Connection}
     */
    public function authorize(Run $run, string $tool, string $connectionId): array
    {
        $provider = $this->catalog->providerOf($tool);
        if (!$provider) throw new ToolRefused('unknown_tool', 'That tool is not available to this teammate.');
        $pinned = collect($run->grant_snapshot ?? [])->firstWhere('connectionId', $connectionId);
        if (!$pinned || !in_array($tool, $pinned['operations'] ?? [], true))
            throw new ToolRefused('not_granted', 'This teammate has no access to that tool on that account.');
        LegacyInstalls::sync($run->user_id);
        $pair = $this->current($run, $pinned);
        if (!$pair) throw new ToolRefused('grant_revoked', 'Access to that account was removed. Start a new task.');
        [$grant, $connection] = $pair;
        if ($connection->revoked_at) throw new ToolRefused('connection_revoked', 'That account was disconnected.');
        if ($connection->provider !== $provider) throw new ToolRefused('wrong_connection', 'That tool does not belong to that account.');
        if ($connection->health !== 'healthy')
            throw new ToolRefused('reconnect_required', ucfirst($provider).' needs to be reconnected before this task can continue.');
        if (!in_array($tool, $grant->operations ?? [], true))
            throw new ToolRefused('not_granted', 'This teammate has no access to that tool on that account.');
        return [$grant, $connection];
    }

    /** @return array{0: Grant, 1: Connection}|null */
    private function current(Run $run, array $pinned): ?array
    {
        $grant = Grant::query()->whereKey($pinned['grantId'] ?? '')->where('user_id', $run->user_id)
            ->where('agent_id', $run->agent_id)->whereNull('revoked_at')->first();
        $connection = $grant ? Connection::query()->whereKey($grant->connection_id)->where('user_id', $run->user_id)
            ->whereNull('revoked_at')->first() : null;
        // A Mac folder grant is offered only to runs on that Mac (ComputerGrants::usable).
        if ($connection?->provider === ComputerTools::PROVIDER && !ComputerGrants::usable($run, $connection)) return null;
        // A browser grant is offered only to runs on a Mac whose app declares browser support.
        if ($connection?->provider === \App\Services\AgentRuns\Browser\BrowserTools::PROVIDER
            && !\App\Services\AgentRuns\Browser\BrowserGrants::usable($run, $connection)) return null;
        if ($connection && \App\Services\AgentRuns\LocalMcp\LocalMcpTools::isProvider($connection->provider)
            && !\App\Services\AgentRuns\LocalMcp\LocalMcpGrants::usable($run, $connection)) return null;
        return $grant && $connection ? [$grant, $connection] : null;
    }
}
