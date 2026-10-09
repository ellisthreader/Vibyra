<?php

namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\{ApiError, RunStates};

/** Account-wide hard bounds; a provider's limits and Cloud allowance still apply. */
final class Capacity
{
    public const RUNNING = 3;
    public const QUEUED = 24;

    public static function supports(RuntimeBinding $binding): bool
    {
        return $binding->provider === 'claude' && ($binding->capabilities['parallelJobsV1'] ?? false) === true
            && ($binding->capabilities['workerSlots'] ?? null) === self::RUNNING;
    }

    public static function admission(int $userId, RuntimeBinding $binding, string $mode): void
    {
        if (($mode === 'independent' && !config('agents_v2.parallel_jobs_enabled'))
            || ($mode === 'coordinated' && !config('agents_v2.coordination_enabled')))
            ApiError::throw(409, 'parallel_jobs_disabled', 'Independent Agent jobs are not enabled.');
        if ($mode !== 'ordered' && !self::supports($binding))
            ApiError::throw(409, 'runtime_upgrade', 'Update this runtime before starting independent Agent jobs. Your draft is still available.');
        if (!AccountLock::enabled($userId)) return;
        if (self::queued($userId)->count() >= self::QUEUED)
            ApiError::throw(429, 'job_queue_full', 'Your Agent queue is full. Finish or cancel a queued task, then send this draft again.');
    }

    public static function active(int $userId)
    {
        return Run::query()->where('user_id', $userId)->whereNotIn('state', RunStates::TERMINAL)
            ->where('lease_expires_at', '>', now());
    }

    public static function queued(int $userId)
    {
        return Run::query()->where('user_id', $userId)->whereNotIn('state', RunStates::TERMINAL)
            ->where(fn ($q) => $q->whereNull('lease_expires_at')->orWhere('lease_expires_at', '<=', now()));
    }

    public static function payload(int $userId): array
    {
        return ['running' => self::active($userId)->count(), 'maxRunning' => self::RUNNING,
            'queued' => self::queued($userId)->count(), 'maxQueued' => self::QUEUED];
    }
}
