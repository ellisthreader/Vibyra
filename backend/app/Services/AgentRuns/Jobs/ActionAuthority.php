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
        if ($execution) \App\Services\AgentOrganizations\Authority::fence($runId);
        $mode = Contexts::mode($run);
        if ($execution && $mode !== 'ordered') {
            if (!config(match ($mode) {'coordinated' => 'agents_v2.coordination_enabled', 'channel' => 'agents_v2.channels_enabled', 'browser_test' => 'agents_v2.browser_workflows_enabled', default => 'agents_v2.parallel_jobs_enabled'}))
                \App\Services\AgentRuns\ApiError::throw(409, 'job_mode_disabled', 'This execution mode was disabled. No new effects may run.');
            Membership::require($run->user_id);
        }
        if ($execution) {
            $binding = RuntimeBinding::query()->findOrFail($run->runtime_binding_id);
            \App\Services\AgentChannels\RunContext::fence($binding, $runId);
            \App\Services\AgentBrowserWorkflows\Context::fence($binding, $runId);
        }
        if ($execution && Context::isolated($run)) {
            $binding = RuntimeBinding::query()->findOrFail($run->runtime_binding_id);
            Context::fence($binding, $runId);
        }
    }
}
