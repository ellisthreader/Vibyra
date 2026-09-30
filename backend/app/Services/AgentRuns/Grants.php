<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Grant;
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;

/** Revisioned per-teammate access to one connection. Connected status alone never grants. */
final class Grants
{
    public function __construct(private readonly ToolCatalog $catalog) {}

    public function put(int $userId, string $agentId, Connection $connection, array $operations): Grant
    {
        $this->agent($userId, $agentId);
        if ($connection->revoked_at) ApiError::throw(409, 'connection_revoked', 'That connection was removed.');
        if ($connection->provider === 'browser')
            ApiError::throw(409, 'browser_grant_sites', 'Choose this teammate\'s allowed sites in its browser access.');
        if ($connection->provider === 'computer')
            ApiError::throw(409, 'computer_grant_local', 'Choose what this teammate may do with a computer folder on that Mac.');
        $allowed = $this->catalog->operations($connection->provider);
        $ops = array_values(array_unique(array_filter($operations, 'is_string')));
        sort($ops);
        if ($ops === [] || array_diff($ops, $allowed) !== [])
            ApiError::throw(422, 'invalid_operations', 'Choose operations this connection offers: '.implode(', ', $allowed).'.');
        return DB::transaction(function () use ($userId, $agentId, $connection, $ops) {
            // Serialize grants on this connection: with no grant row yet there is nothing to lock, so two
            // first grants used to each insert one (and a later edit changed only one of them).
            $locked = DB::table('agent_connections')->where('id', $connection->id)->lockForUpdate()->first();
            if (!$locked || $locked->revoked_at) ApiError::throw(409, 'connection_revoked', 'That connection was removed.');
            $grant = Grant::query()->where('user_id', $userId)->where('agent_id', $agentId)
                ->where('connection_id', $connection->id)->whereNull('revoked_at')->lockForUpdate()->first();
            if ($grant && $grant->operations === $ops) return $grant;
            if ($grant) {
                $grant->forceFill(['operations' => $ops, 'revision' => $grant->revision + 1])->save();
                return $grant;
            }
            return Grant::query()->create(['user_id' => $userId, 'agent_id' => $agentId,
                'connection_id' => $connection->id, 'operations' => $ops, 'revision' => 1]);
        });
    }

    public function revoke(int $userId, string $agentId, string $connectionId): void
    {
        Grant::query()->where('user_id', $userId)->where('agent_id', $agentId)->where('connection_id', $connectionId)
            ->whereNull('revoked_at')->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
    }

    public function revokeForConnection(string $connectionId): void
    {
        Grant::query()->where('connection_id', $connectionId)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
    }

    /** @return Grant[] active grants on active connections */
    public function active(int $userId, string $agentId): array
    {
        return Grant::query()->where('agent_grants.user_id', $userId)->where('agent_id', $agentId)
            ->whereNull('agent_grants.revoked_at')
            ->join('agent_connections', 'agent_connections.id', '=', 'agent_grants.connection_id')
            ->whereNull('agent_connections.revoked_at')
            ->orderBy('agent_connections.created_at')->orderBy('agent_grants.id')
            ->get(['agent_grants.*', 'agent_connections.generation as connection_generation'])->all();
    }

    /** Pinned into a run at admission; tool calls need both this and the current grant. */
    public function snapshot(int $userId, string $agentId): array
    {
        return array_map(fn (Grant $g) => ['grantId' => $g->id, 'connectionId' => $g->connection_id,
            'revision' => $g->revision, 'generation' => (int) $g->connection_generation,
            'operations' => $g->operations], $this->active($userId, $agentId));
    }

    public function payload(Grant $g): array
    {
        return ['id' => $g->id, 'agentId' => $g->agent_id, 'connectionId' => $g->connection_id,
            'operations' => $g->operations, 'revision' => $g->revision,
            'revokedAt' => $g->revoked_at?->toIso8601String()];
    }

    public function agent(int $userId, string $agentId): object
    {
        $agent = DB::table('agent_teammates')->where('user_id', $userId)->where('id', $agentId)->first();
        if (!$agent) ApiError::throw(404, 'agent_not_found', 'That teammate does not exist.');
        if ($agent->archived_at) ApiError::throw(409, 'agent_archived', 'Restore this teammate first.');
        return $agent;
    }
}
