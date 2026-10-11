<?php
namespace App\Services\AgentCapabilities;
use App\Models\AgentCapabilities\Installation;
use App\Models\AgentV2\{Connection, Run};
use App\Services\AgentRuns\ApiError;
/** A tombstone remains managed forever: neither implicit grants nor old runs can resurrect it. */
final class Authority
{
    public static function managed(string $connectionId): bool
    {
        return Installation::query()->where('connection_id', $connectionId)->exists();
    }
    public static function snapshot(string $connectionId): ?array
    {
        $i = Installation::query()->where('connection_id', $connectionId)->first();
        return $i ? ['id' => $i->id, 'revision' => $i->revision, 'reviewHash' => $i->review_hash] : null;
    }
    public static function current(Installation $i, Connection $c): bool
    {
        if (!config('agents_v2.capabilities_enabled') || !\App\Services\AgentRuns\Jobs\Membership::allows($i->user_id) || $i->revoked_at || $c->revoked_at || $c->health !== 'healthy'
            || $i->user_id !== $c->user_id || $i->connection_generation !== $c->generation) return false;
        try { $row = app(Catalogue::class)->get($i->capability_id, $c); }
        catch (\Throwable) { return false; }
        return $row['readiness'] === 'ready' && $row['reviewHash'] === $i->review_hash && $row['version'] === $i->version;
    }
    public static function allows(Run $run, Connection $connection, ?array $pinnedGrant = null): bool
    {
        $i = Installation::query()->where('connection_id', $connection->id)->first();
        if (!$i) return true;
        $pin = ($pinnedGrant ?? collect($run->grant_snapshot ?? [])->firstWhere('connectionId', $connection->id) ?? [])['capability'] ?? null;
        return $pin === self::snapshot($connection->id) && self::current($i, $connection);
    }
    public static function grant(Connection $connection, array $operations): void
    {
        $i = Installation::query()->where('connection_id', $connection->id)->first();
        if ($i && (!self::current($i, $connection) || array_diff($operations, $i->operations ?? [])))
            ApiError::throw(409, 'capability_review_required', 'Review and install the current capability before granting access.');
    }
}
