<?php
namespace App\Services\AgentCapabilities;
use App\Models\AgentCapabilities\Installation;
use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\{ApiError, Canonical, Grants};
use App\Services\AgentRuns\Jobs\{AccountLock, Membership};
use Illuminate\Support\Facades\DB;
final class Installations
{
    public function __construct(private readonly Catalogue $catalogue) {}
    public function list(int $userId, ?string $capabilityId = null, ?string $connectionId = null): array
    {
        $query = Installation::query()->where('user_id', $userId);
        if ($capabilityId !== null) $query->where('capability_id', $capabilityId);
        if ($connectionId !== null) $query->where('connection_id', $connectionId);
        return $query->orderBy('id')->get()->map(fn ($i) => $this->payload($i))->all();
    }
    public function install(int $userId, string $id, array $data): array
    {
        Membership::require($userId);
        if (!config('agents_v2.capabilities_enabled')) ApiError::throw(409, 'capabilities_disabled', 'Capability installation is unavailable.');
        return DB::transaction(function () use ($userId, $id, $data) {
            AccountLock::force($userId);
            $c = Connection::query()->where('user_id', $userId)->whereKey($data['connectionId'])->lockForUpdate()->firstOrFail();
            $row = $this->catalogue->get($id, $c);
            if ($c->revoked_at || $c->health !== 'healthy' || $c->generation !== $data['expectedConnectionGeneration']
                || $row['readiness'] !== 'ready' || $row['version'] !== $data['version'] || $row['reviewHash'] !== $data['reviewHash']
                || $row['operations'] === []) ApiError::throw(409, 'capability_review_changed', 'The account or tools changed. Review them again.');
            $hash = Canonical::hash(['capabilityId' => $id, ...$data]);
            $i = Installation::query()->where('connection_id', $c->id)->lockForUpdate()->first();
            if ($i && !$i->revoked_at && $i->request_hash === $hash) return $this->payload($i);
            if (($i?->revision ?? 0) !== $data['expectedRevision'] || ($i && $i->capability_id !== $id))
                ApiError::throw(409, 'capability_revision_changed', 'This installation changed. Reload before reviewing it again.');
            $values = ['user_id' => $userId, 'connection_id' => $c->id, 'capability_id' => $id,
                'connection_generation' => $c->generation, 'version' => $row['version'], 'review_hash' => $row['reviewHash'],
                'revision' => ($i?->revision ?? 0) + 1, 'operations' => array_column($row['operations'], 'tool'),
                'request_hash' => $hash, 'revoked_at' => null];
            if ($i) $i->forceFill($values)->save(); else $i = Installation::query()->create($values);
            return $this->payload($i);
        });
    }
    public function revoke(int $userId, string $id, array $data): array
    {
        return DB::transaction(function () use ($userId, $id, $data) {
            AccountLock::force($userId);
            $i = Installation::query()->where('user_id', $userId)->where('capability_id', $id)
                ->where('connection_id', $data['connectionId'])->lockForUpdate()->firstOrFail();
            $hash = Canonical::hash(['remove' => $id, ...$data]);
            if ($i->revoked_at && $i->request_hash === $hash) return $this->payload($i);
            if ($i->revision !== $data['expectedRevision']) ApiError::throw(409, 'capability_revision_changed', 'This installation changed. Reload before removing it.');
            $i->forceFill(['revoked_at' => now(), 'revision' => $i->revision + 1, 'request_hash' => $hash])->save();
            app(Grants::class)->revokeForConnection($i->connection_id);
            return $this->payload($i);
        });
    }
    public function payload(Installation $i): array
    {
        $c = Connection::query()->whereKey($i->connection_id)->first();
        $status = $i->revoked_at ? 'revoked' : (!$c || $c->revoked_at || $c->health === 'reconnect_required' ? 'disconnected'
            : (Authority::current($i, $c) ? 'installed' : 'needs_review'));
        $teammates = DB::table('agent_grants')->join('agent_teammates', 'agent_teammates.id', '=', 'agent_grants.agent_id')
            ->where('agent_grants.connection_id', $i->connection_id)->where('agent_grants.user_id', $i->user_id)
            ->whereNull('agent_grants.revoked_at')->orderBy('agent_teammates.name')
            ->get(['agent_grants.agent_id', 'agent_teammates.name', 'agent_grants.operations', 'agent_grants.revision'])
            ->map(fn ($g) => ['agentId' => $g->agent_id, 'name' => $g->name,
                'operations' => json_decode($g->operations, true) ?: [], 'revision' => (int) $g->revision])->all();
        return ['id' => $i->id, 'capabilityId' => $i->capability_id, 'connectionId' => $i->connection_id,
            'connectionGeneration' => $i->connection_generation, 'version' => $i->version, 'reviewHash' => $i->review_hash,
            'revision' => $i->revision, 'status' => $status, 'operations' => $i->operations,
            'teammates' => $teammates, 'updatedAt' => $i->updated_at?->toIso8601String()];
    }
}
