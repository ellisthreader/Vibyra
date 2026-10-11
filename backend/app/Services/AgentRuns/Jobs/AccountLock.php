<?php

namespace App\Services\AgentRuns\Jobs;

use Illuminate\Support\Facades\DB;

/** The outer account mutex for Stage 5 admissions, claims and write ownership. */
final class AccountLock
{
    public static function enabled(?int $userId = null): bool
    {
        return (bool) config('agent_depth.rules') || (bool) config('agents_v2.organisation_enabled') || (bool) config('agents_v2.capabilities_enabled') || (bool) config('agents_v2.channels_enabled') || (bool) config('agents_v2.browser_workflows_enabled')
            || (bool) config('agents_v2.parallel_jobs_enabled') || (bool) config('agents_v2.coordination_enabled')
            || ($userId !== null && DB::table('agent_job_accounts')->where('user_id', $userId)->exists());
    }

    public static function force(int $userId): object
    {
        DB::table('agent_job_accounts')->insertOrIgnore(['user_id' => $userId, 'write_epoch' => 0]);
        return DB::table('agent_job_accounts')->where('user_id', $userId)->lockForUpdate()->first();
    }

    public static function lock(int $userId): ?object
    {
        if (!self::enabled($userId)) return null;
        DB::table('agent_job_accounts')->insertOrIgnore(['user_id' => $userId, 'write_epoch' => 0]);
        return DB::table('agent_job_accounts')->where('user_id', $userId)->lockForUpdate()->first();
    }
}
