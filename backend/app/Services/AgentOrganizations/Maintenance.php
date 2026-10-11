<?php
namespace App\Services\AgentOrganizations;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Jobs\AccountLock, Lifecycle, RunStates};
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Exceptions\HttpResponseException;
final class Maintenance
{
    /** Runs remain readable but authority loss cancels queued/live work; dispatching actions retain late receipt paths. */
    public static function stopRevoked(): int
    {
        $stopped = 0;
        Run::query()->whereNotIn('state', RunStates::TERMINAL)->whereIn('id', DB::table('agent_organisation_runs')->select('run_id'))
            ->orderBy('id')->chunkById(100, function ($runs) use (&$stopped) {
                foreach ($runs as $r) $stopped += DB::transaction(function () use ($r) {
                    AccountLock::force($r->user_id);
                    try { Authority::fence($r->id); return 0; }
                    catch (HttpResponseException $e) {
                        if (!str_starts_with((string) ($e->getResponse()->getData(true)['code'] ?? ''), 'organisation_')) throw $e;
                    }
                    $run = Run::query()->whereKey($r->id)->lockForUpdate()->first();
                    if (!$run || RunStates::terminal($run->state)) return 0;
                    $run->forceFill(['cancel_requested_at' => now()])->save();
                    DB::table('agent_tool_actions')->where('run_id', $run->id)->whereIn('state', ['pending_approval', 'approved'])
                        ->update(['state' => 'cancelled', 'summary' => 'Organisation authority removed', 'updated_at' => now()]);
                    app(Lifecycle::class)->move($run, RunStates::CANCELLED, 'organisation_authority_removed');
                    return 1;
                });
            });
        return $stopped;
    }
}
