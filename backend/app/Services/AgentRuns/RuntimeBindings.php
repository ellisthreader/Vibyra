<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\RuntimeBinding;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The Mac's selected AI account for Agent runs: one active binding per computer.
 * Re-registering (a new selection) updates it in place, bumps its revision and
 * rotates the runner key. Runs stay pinned to the account they were admitted on.
 * Runner auth mirrors v1 Agent Computer: account session + registered host +
 * a per-binding runner key that is only ever stored hashed.
 */
final class RuntimeBindings
{
    public const RUNTIME_REQUIRED = 'Teammates run on an AI account you choose on your Mac, and none is selected yet.';
    public const RUNTIME_FIX = ['action' => 'choose_ai_account',
        'message' => 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.'];

    public function register(int $userId, array $data): array
    {
        return DB::transaction(function () use ($userId, $data) {
            if (RuntimeBinding::where('host_id', $data['hostId'])->where('execution_target', 'cloud')->exists())
                ApiError::throw(403, 'cloud_registration_required', 'Cloud runners must use their managed runtime authority.');
            $host = DB::table('remote_hosts')->where('host_id', $data['hostId'])->lockForUpdate()->first();
            if (!$host) {
                // Two first registrations of one new computer: the loser waits on the unique host_id, inserts
                // nothing, and then locks and checks the winner's row like any existing host.
                DB::table('remote_hosts')->insertOrIgnore(['user_id' => $userId, 'host_id' => $data['hostId'],
                    'name' => 'Vibyra Agent Computer', 'platform' => 'macos', 'registered_at' => now(),
                    'created_at' => now(), 'updated_at' => now()]);
                $host = DB::table('remote_hosts')->where('host_id', $data['hostId'])->lockForUpdate()->first();
            }
            if ($host && \Illuminate\Support\Facades\DB::table('cloud_workspaces')->where('remote_host_id', $host->id)->where('kind', 'computer')->exists())
                ApiError::throw(403, 'cloud_registration_required', 'Cloud runners must use their managed runtime authority.');
            if ($host && ((int) $host->user_id !== $userId || $host->revoked_at))
                ApiError::throw(409, 'host_unavailable', 'This computer identity is unavailable.');
            $key = Str::random(64);
            $values = ['provider' => $data['provider'], 'account_ref' => $data['accountRef'], 'model' => $data['model'],
                'effort' => $data['effort'] ?? null, 'capabilities' => $data['capabilities'] ?? [],
                'provider_version' => $data['providerVersion'] ?? null, 'runner_key_hash' => hash('sha256', $key),
                'last_seen_at' => now()];
            $binding = RuntimeBinding::query()->where('user_id', $userId)->where('host_id', $data['hostId'])
                ->whereNull('revoked_at')->lockForUpdate()->first();
            if ($binding) $binding->forceFill([...$values, 'revision' => $binding->revision + 1])->save();
            else $binding = RuntimeBinding::query()->create([...$values, 'user_id' => $userId,
                'host_id' => $data['hostId'], 'revision' => 1]);
            return [...$this->payload($binding), 'runnerKey' => $key];
        });
    }

    /** The runner key alone when `$userId` is null (the owner is the binding's); with a session user, only that user's binding. */
    public function authenticate(?int $userId, string $id, ?string $key): RuntimeBinding
    {
        $binding = RuntimeBinding::query()->whereKey($id)->whereNull('revoked_at')->first();
        if ($binding && $userId !== null && (int) $binding->user_id !== $userId) $binding = null;
        if (!$binding) ApiError::throw(404, 'runtime_not_found', 'This AI account binding does not exist.');
        if (!is_string($key) || strlen($key) !== 64 || !hash_equals($binding->runner_key_hash, hash('sha256', $key)))
            ApiError::throw(403, 'invalid_runner_key', 'Invalid runner key.');
        if (Cloud\Authority::cloud($binding)) app(Cloud\Authority::class)->check($binding);
        elseif (!DB::table('remote_hosts')->where('user_id', $binding->user_id)->where('host_id', $binding->host_id)
            ->whereNull('revoked_at')->exists()) ApiError::throw(409, 'host_revoked', 'This computer was removed.');
        RuntimeBinding::query()->whereKey($binding->id)->update(['last_seen_at' => now()]);
        return $binding;
    }

    /** The binding a new run pins: the named one, or the most recently selected. */
    public function select(int $userId, ?string $id): RuntimeBinding
    {
        $query = RuntimeBinding::query()->where('user_id', $userId)->whereNull('revoked_at');
        $binding = $id ? $query->whereKey($id)->first() : $query->where('execution_target', 'local')->orderByDesc('updated_at')->first();
        if (!$binding) ApiError::throw(409, 'runtime_required', self::RUNTIME_REQUIRED, ['fix' => self::RUNTIME_FIX]);
        if (Cloud\Authority::cloud($binding)) app(Cloud\Policies::class)->current($binding);
        if (($binding->capabilities['controlledTools'] ?? false) !== true)
            ApiError::throw(409, 'provider_unsupported', 'The selected AI account cannot use controlled Agent tools yet.',
                ['fix' => [...self::RUNTIME_FIX, 'message' => 'Update Vibyra on your Mac, then choose a Claude Code account in Settings → AI accounts.']]);
        return $binding;
    }

    public function revoke(int $userId, string $id): void
    {
        RuntimeBinding::query()->where('user_id', $userId)->whereKey($id)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    /** @return RuntimeBinding[] */
    public function list(int $userId): array
    {
        return RuntimeBinding::query()->where('user_id', $userId)->whereNull('revoked_at')->orderByDesc('updated_at')->get()->all();
    }

    public static function snapshot(RuntimeBinding $b): array
    {
        return ['id' => $b->id, 'executionTarget' => $b->execution_target ?? 'local', 'cloudWorkspaceId' => $b->cloud_workspace_id,
            'accountId' => $b->account_ref, 'bindingId' => $b->id, 'revision' => $b->revision, 'hostId' => $b->host_id, 'provider' => $b->provider,
            'accountRef' => $b->account_ref, 'model' => $b->model, 'effort' => $b->effort,
            'providerVersion' => $b->provider_version, 'capabilities' => $b->capabilities ?? []];
    }

    public function payload(RuntimeBinding $b): array
    {
        return ['executionTarget' => $b->execution_target ?? 'local', 'cloudWorkspaceId' => $b->cloud_workspace_id,
            'accountId' => $b->account_ref, 'id' => $b->id, 'hostId' => $b->host_id, 'provider' => $b->provider, 'accountRef' => $b->account_ref,
            'model' => $b->model, 'effort' => $b->effort, 'providerVersion' => $b->provider_version,
            'capabilities' => (object) ($b->capabilities ?? []), 'revision' => $b->revision,
            'online' => $b->last_seen_at !== null && $b->last_seen_at->isAfter(now()->subSeconds((int) config('agents_v2.online_seconds'))),
            'lastSeenAt' => $b->last_seen_at?->toIso8601String()];
    }
}
