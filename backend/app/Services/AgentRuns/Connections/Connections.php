<?php

namespace App\Services\AgentRuns\Connections;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Grants;
use App\Services\ChatConnectors\Installs;
use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/** Connection IDs over existing installs plus extra accounts per provider. */
final class Connections
{
    public function __construct(private readonly Registry $registry, private readonly Installs $installs,
        private readonly Grants $grants) {}

    /** @return Connection[] active connections, oldest first */
    public function active(int $userId): array
    {
        LegacyInstalls::sync($userId);
        return Connection::query()->where('user_id', $userId)->whereNull('revoked_at')
            ->orderBy('created_at')->orderBy('id')->get()->all();
    }

    public function find(int $userId, string $id): Connection
    {
        LegacyInstalls::sync($userId);
        $row = Connection::query()->where('user_id', $userId)->whereKey($id)->first();
        if (!$row) ApiError::throw(404, 'connection_not_found', 'That connection does not exist.');
        return $row;
    }

    /**
     * Connect another account for a provider. The same external identity updates its
     * existing connection (new generation); a new identity gets its own ID.
     */
    public function addAccount(int $userId, string $provider, string $credential, array $grant = []): Connection
    {
        if (!$this->registry->has($provider)) ApiError::throw(404, 'unknown_provider', 'That integration does not exist.');
        try { $identity = $this->registry->for($provider)->connect($credential); }
        catch (\Throwable $e) { ApiError::throw(422, 'credential_refused', 'The provider refused that sign-in.'); }
        return DB::transaction(function () use ($userId, $provider, $credential, $grant, $identity) {
            // A brand-new identity has no row to lock, so two completions at once each created one (a double OAuth
            // callback left duplicate accounts). Serialize per account on the user row.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $existing = Connection::query()->where('user_id', $userId)->where('provider', $provider)
                ->where('external_identity', $identity)->whereNull('revoked_at')->lockForUpdate()->first();
            if ($existing?->install_id) {
                $this->installs->connect($userId, $provider, $credential, $grant);
                LegacyInstalls::sync($userId);
                return $existing->fresh();
            }
            $values = ['credential' => Crypt::encryptString($credential),
                'refresh_token' => is_string($grant['refresh'] ?? null) ? Crypt::encryptString($grant['refresh']) : null,
                'expires_at' => is_int($grant['expires_in'] ?? null) ? now()->addSeconds($grant['expires_in']) : null,
                'health' => 'healthy', 'scope_issue' => null,
                'scopes' => is_string($grant['scope'] ?? null) ? array_values(array_filter(preg_split('/[\s,]+/', $grant['scope']))) : null];
            if ($existing) {
                $existing->forceFill([...$values, 'generation' => $existing->generation + 1])->save();
                return $existing;
            }
            return Connection::query()->create([...$values, 'user_id' => $userId, 'provider' => $provider,
                'external_identity' => $identity, 'generation' => 1, 'capability_revision' => 1]);
        });
    }

    public function revoke(int $userId, string $id): void
    {
        $row = $this->find($userId, $id);
        if ($row->revoked_at) return;
        if ($row->install_id) {
            // The legacy install is this account's credential store: disconnecting it is the revocation.
            $this->installs->disconnect($userId, $row->provider);
            LegacyInstalls::sync($userId);
            return;
        }
        DB::transaction(function () use ($row) {
            $row->forceFill(['revoked_at' => now(), 'health' => 'revoked', 'credential' => null,
                'refresh_token' => null])->save();
            $this->grants->revokeForConnection($row->id);
        });
    }

    /** The provider said this account lacks a permission; remembered until the next credential generation. */
    public function markScope(Connection $row, string $tool): void
    {
        Connection::query()->whereKey($row->id)->update(['scope_issue' => json_encode(['generation' => $row->generation,
            'tool' => $tool, 'at' => now()->toIso8601String()]), 'updated_at' => now()]);
    }

    public function markReconnect(Connection $row): void
    {
        Connection::query()->whereKey($row->id)->update(['health' => 'reconnect_required', 'updated_at' => now()]);
        $row->health = 'reconnect_required';
    }

    public function payload(Connection $row): array
    {
        return ['id' => $row->id, 'provider' => $row->provider, 'account' => $row->external_identity,
            'health' => $row->health, 'generation' => $row->generation,
            'source' => $row->install_id ? 'install' : 'connection',
            'createdAt' => $row->created_at?->toIso8601String()];
    }
}
