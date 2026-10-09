<?php

namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Job, Run, ToolAction};
use App\Services\AgentRuns\Events;
use Illuminate\Support\Facades\DB;

/** Fences concurrent changes before dispatch; unknown writes keep their resource reserved. */
final class ResourceClaims
{
    public static function acquire(Run $run, ToolAction $action): bool
    {
        if (!AccountLock::enabled($run->user_id) || $action->kind !== 'write') return true;
        // Caller holds AccountLock before the run/action locks. No provider I/O occurs here.
        $key = ResourceKeys::key($action);
        $row = DB::table('agent_job_resources')->where('user_id', $run->user_id)->where('resource_hash', $key)->first();
        if ($row?->action_id === $action->id) return true;
        $jobEpoch = (int) Job::query()->whereKey($run->id)->value('write_epoch');
        $other = $row && $row->run_id !== $run->id;
        $unsettled = $row?->action_id && ToolAction::query()->whereKey($row->action_id)
            ->whereIn('state', ['dispatching', 'unknown'])->exists();
        $stale = $other && (int) $row->write_epoch > $jobEpoch;
        if ($unsettled || $stale) {
            $reason = $unsettled ? 'resource_busy' : 'resource_changed';
            $message = $unsettled ? 'Another change to this resource is still running or has an unknown outcome. Check its receipt first.'
                : 'Another job changed this resource after this task began. Review the current resource in a new task before changing it.';
            $action->forceFill(['state' => 'refused', 'summary' => $message, 'result' => ['reason' => $reason, 'error' => $message]])->save();
            app(Events::class)->append($run, 'tool.refused', ['actionId' => $action->id, 'callId' => $action->call_id,
                'tool' => $action->tool, 'reason' => $reason, 'message' => $message]);
            return false;
        }
        DB::table('agent_job_accounts')->where('user_id', $run->user_id)->increment('write_epoch');
        $epoch = DB::table('agent_job_accounts')->where('user_id', $run->user_id)->value('write_epoch');
        DB::table('agent_job_resources')->updateOrInsert(['user_id' => $run->user_id, 'resource_hash' => $key],
            ['write_epoch' => $epoch, 'run_id' => $run->id, 'action_id' => $action->id]);
        return true;
    }
}
