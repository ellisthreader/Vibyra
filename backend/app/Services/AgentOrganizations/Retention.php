<?php
namespace App\Services\AgentOrganizations;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Jobs\AccountLock, RunStates};
use Illuminate\Support\Facades\DB;
final class Retention
{
    /** Clear terminal task content, retaining authority, counters and minimal factual receipts. Unknown effects never age out here. */
    public static function prune(): int
    {
        $count = 0;
        DB::table('agent_organisation_runs')->whereNull('content_cleared_at')->orderBy('run_id')
            ->chunkById(100, function ($pins) use (&$count) {
                foreach ($pins as $pin) $count += DB::transaction(function () use ($pin) {
                    AccountLock::force($pin->user_id);
                    \App\Services\Teams\Teams::lock($pin->organization_id);
                    $policy = Policies::get($pin->organization_id);
                    $run = Run::query()->whereKey($pin->run_id)->lockForUpdate()->first();
                    if (!$run || !RunStates::terminal($run->state) || !$run->finished_at
                        || $run->finished_at->isAfter(now()->subDays($policy->retention_days))) return 0;
                    if (DB::table('agent_tool_actions')->where('run_id', $run->id)->whereIn('state', ['dispatching', 'unknown'])->exists()) return 0;
                    RetainedFiles::clear($run);
                    RetainedContent::clear($run);
                    $actions = DB::table('agent_tool_actions')->where('run_id', $run->id)->pluck('id');
                    DB::table('agent_draft_revisions')->whereIn('action_id', $actions)->delete();
                    DB::table('agent_tool_actions')->where('run_id', $run->id)->update(['arguments' => '{}', 'result' => null,
                        'summary' => 'Content removed by organisation retention']);
                    DB::table('agent_receipts')->where('run_id', $run->id)->update(['summary' => 'Content removed by organisation retention', 'provider_url' => null]);
                    foreach (['agent_run_events', 'agent_run_instructions', 'agent_run_skill_snapshots', 'agent_browser_files'] as $table)
                        DB::table($table)->where('run_id', $run->id)->delete();
                    DB::table('agent_run_jobs')->where('run_id', $run->id)->update(['context' => null]);
                    $run->forceFill(['prompt' => '', 'answer' => null, 'attachments' => [], 'state_reason' => 'organisation_content_cleared',
                        'event_seq' => $run->event_seq + 1])->save();
                    DB::table('agent_organisation_runs')->where('run_id', $run->id)->update(['content_cleared_at' => now()]);
                    return 1;
                });
            }, 'run_id');
        return $count;
    }
}
