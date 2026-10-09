<?php
namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentCoordination\Context;

/** Lock the account and reviewed group before any run/action dispatch locks. */
final class ActionAuthority
{
    public static function beforeRun(string $runId, bool $execution = true): void
    {
        $run = Run::query()->findOrFail($runId);
        AccountLock::lock($run->user_id);
        $mode = Contexts::mode($run);
        if ($execution && $mode !== 'ordered') {
            if (!config($mode === 'coordinated' ? 'agents_v2.coordination_enabled' : 'agents_v2.parallel_jobs_enabled'))
                \App\Services\AgentRuns\ApiError::throw(409, 'job_mode_disabled', 'This execution mode was disabled. No new effects may run.');
            Membership::require($run->user_id);
        }
        if ($execution && Context::isolated($run)) {
            $binding = RuntimeBinding::query()->findOrFail($run->runtime_binding_id);
            Context::fence($binding, $runId);
        }
    }
}
