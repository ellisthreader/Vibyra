<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Run, RuntimeBinding};
use Illuminate\Support\Facades\DB;
use App\Services\AgentRuns\{ApiError, RuntimeBindings};

/** Selection identity, unlike heartbeat/key revisions, cannot drift after human review. */
final class RuntimePins
{
    private const KEYS = ['bindingId', 'hostId', 'executionTarget', 'cloudWorkspaceId', 'provider', 'accountRef', 'model', 'effort'];

    public static function lock(int $userId, string $runtimeId): void
    {
        RuntimeBinding::query()->where('user_id', $userId)->whereKey($runtimeId)->lockForUpdate()->first();
    }

    public static function capture(int $userId, string $runtimeId): array
    {
        // Hold this row through admission: a local binding can be updated in place.
        self::lock($userId, $runtimeId);
        $snapshot = RuntimeBindings::snapshot(app(RuntimeBindings::class)->select($userId, $runtimeId));
        return [...$snapshot, 'accountLabel' => self::label($snapshot)];
    }

    public static function require(int $userId, array $snapshot): void
    {
        $fresh = self::capture($userId, $snapshot['bindingId']);
        if (isset($snapshot['workAgentId'], $snapshot['skillsHash']) && !hash_equals($snapshot['skillsHash'], SkillSnapshots::selectionHash($userId, $snapshot['workAgentId'])))
            ApiError::throw(409, 'work_skills_changed', 'Assigned skill instructions changed. Review a new plan.');
        if (!self::same($snapshot, $fresh)) ApiError::throw(409, 'work_runtime_changed', 'The selected computer or AI account changed. Review a new plan.');
    }

    public static function saveRun(Run $run, array $snapshot, string $kind, string $workId, ?\DateTimeInterface $expiry): void
    {
        if (isset($snapshot['skillsHash']) && !hash_equals($snapshot['skillsHash'], SkillSnapshots::runHash($run)))
            ApiError::throw(409, 'work_skills_changed', 'Assigned skill instructions changed during admission.');
        DB::table('agent_work_run_pins')->insertOrIgnore(['run_id' => $run->id, 'user_id' => $run->user_id,
            'work_kind' => $kind, 'work_id' => $workId, 'runtime_snapshot' => \App\Services\AgentRuns\Canonical::json($snapshot), 'expires_at' => $expiry]);
    }

    public static function fenceBinding(RuntimeBinding $binding, string $runId): void
    {
        if (!DB::table('agent_work_run_pins')->where('run_id', $runId)->exists()) return;
        $fresh = RuntimeBinding::whereKey($binding->id)->lockForUpdate()->first();
        if (!$fresh || $fresh->revoked_at || !hash_equals($fresh->runner_key_hash, $binding->runner_key_hash)
            || !self::same(RuntimeBindings::snapshot($fresh), RuntimeBindings::snapshot($binding)))
            ApiError::throw(409, 'work_runtime_changed', 'The reviewed runtime selection changed.');
    }

    public static function allowsRun(RuntimeBinding $binding, Run $run): bool
    {
        $pin = DB::table('agent_work_run_pins')->where('run_id', $run->id)->first();
        if (!$pin) return true;
        return config('agents_v2.work_enabled') && (int) $pin->user_id === (int) $run->user_id
            && (!$pin->expires_at || \Carbon\CarbonImmutable::parse($pin->expires_at)->isFuture())
            && self::same(json_decode($pin->runtime_snapshot, true), RuntimeBindings::snapshot($binding))
            && self::same(json_decode($pin->runtime_snapshot, true), $run->runtime_snapshot);
    }

    public static function label(array $snapshot): string
    {
        if (isset($snapshot['accountLabel'])) return $snapshot['accountLabel'];
        if (($snapshot['executionTarget'] ?? 'local') === 'cloud') {
            $encoded = DB::table('agent_cloud_accounts')->where('workspace_id', $snapshot['cloudWorkspaceId'] ?? null)->value('accounts');
            foreach (json_decode($encoded ?: '[]', true) as $account) if (($account['accountId'] ?? null) === ($snapshot['accountRef'] ?? null)
                && is_string($account['label'] ?? null) && trim($account['label']) !== '') return mb_substr($account['label'], 0, 120);
            return 'Claude Cloud account';
        }
        return mb_substr(ucfirst($snapshot['provider'] ?? 'AI').' · '.($snapshot['accountRef'] ?? 'Selected account'), 0, 120);
    }

    public static function same(array $first, array $second): bool
    {
        foreach (self::KEYS as $key) if (($first[$key] ?? null) !== ($second[$key] ?? null)) return false;
        return true;
    }
}
