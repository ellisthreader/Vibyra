<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, Grant, Run};
use App\Services\AgentRuns\{ApiError, Grants};
use Illuminate\Support\Facades\DB;

/**
 * A teammate's browser grant: one `browser` connection (its `scopes` are the
 * allowed site origins the person chose) plus one V2 grant for that teammate.
 * Changing the sites bumps the connection generation, so every outstanding
 * approval fingerprint goes stale. Removing it revokes both; the Mac profile
 * for the old connection is never reachable again (profiles are keyed by it).
 */
final class BrowserGrants
{
    public function __construct(private readonly Grants $grants) {}

    public function show(int $userId, string $agentId): ?array
    {
        $this->grants->agent($userId, $agentId);
        $pair = self::active($userId, $agentId);
        return $pair ? self::payload(...$pair) : null;
    }

    public function put(int $userId, string $agentId, array $rawOrigins): array
    {
        $this->grants->agent($userId, $agentId);
        $origins = BrowserOrigins::list($rawOrigins);
        return DB::transaction(function () use ($userId, $agentId, $origins) {
            // A first grant has no connection row to lock, so parallel first grants each created a browser connection and a
            // grant (the teammate kept several, and a later edit changed only one). Serialize per account on the user row.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $pair = self::active($userId, $agentId, true);
            $ops = array_keys(BrowserTools::TOOLS);
            sort($ops);
            if (!$pair) {
                $connection = Connection::query()->create(['user_id' => $userId, 'provider' => BrowserTools::PROVIDER,
                    'external_identity' => 'Browser', 'scopes' => $origins, 'generation' => 1, 'capability_revision' => 1,
                    'health' => 'healthy']);
                $grant = Grant::query()->create(['user_id' => $userId, 'agent_id' => $agentId,
                    'connection_id' => $connection->id, 'operations' => $ops, 'revision' => 1]);
                return self::payload($grant, $connection);
            }
            [$grant, $connection] = $pair;
            if ($connection->scopes !== $origins)
                $connection->forceFill(['scopes' => $origins, 'generation' => $connection->generation + 1])->save();
            return self::payload($grant, $connection);
        });
    }

    public function revoke(int $userId, string $agentId): void
    {
        $this->grants->agent($userId, $agentId);
        DB::transaction(function () use ($userId, $agentId) {
            $pair = self::active($userId, $agentId, true);
            if (!$pair) return;
            $pair[1]->forceFill(['revoked_at' => now(), 'health' => 'revoked'])->save();
            $this->grants->revokeForConnection($pair[1]->id);
        });
    }

    /** @return array{0: Grant, 1: Connection}|null */
    private static function active(int $userId, string $agentId, bool $lock = false): ?array
    {
        $grant = Grant::query()->where('agent_grants.user_id', $userId)->where('agent_id', $agentId)
            ->whereNull('agent_grants.revoked_at')
            ->join('agent_connections', 'agent_connections.id', '=', 'agent_grants.connection_id')
            ->where('agent_connections.provider', BrowserTools::PROVIDER)->whereNull('agent_connections.revoked_at')
            ->first(['agent_grants.*']);
        if (!$grant) return null;
        $query = Connection::query()->whereKey($grant->connection_id);
        return [$grant, $lock ? $query->lockForUpdate()->firstOrFail() : $query->firstOrFail()];
    }

    public static function payload(Grant $grant, Connection $connection): array
    {
        return ['connectionId' => $connection->id, 'grantId' => $grant->id, 'origins' => $connection->scopes ?? [],
            'generation' => (int) $connection->generation, 'updatedAt' => $connection->updated_at?->toIso8601String()];
    }

    /** Offered only to runs on a Mac whose app declares browser support, for the grant's own teammate. */
    public static function usable(Run $run, Connection $connection): bool
    {
        $runtime = $run->runtime_snapshot ?? [];
        return ($runtime['capabilities']['browserTools'] ?? false) === true
            && Grant::query()->where('connection_id', $connection->id)->where('agent_id', $run->agent_id)
                ->whereNull('revoked_at')->exists();
    }

    /** True when `$url`'s origin is one the person granted on this connection. */
    public static function allows(Connection $connection, mixed $url): bool
    {
        $origin = BrowserOrigins::ofUrl($url);
        return $origin !== null && in_array($origin, $connection->scopes ?? [], true);
    }
}
