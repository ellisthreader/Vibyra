<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\{Connection, Run, ToolAction};
use App\Services\AgentRuns\Browser\BrowserTools;
use App\Services\AgentRuns\Computer\ComputerTools;
use App\Services\AgentRuns\LocalMcp\LocalMcpTools;
use App\Services\AgentRuns\{Lifecycle, RunStates};
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Finishes an action a crash left `approved`: the approval committed, the process died before the dispatch claim, so nothing
 * was sent and the run's `/complete` is refused `actions_open` for ever. After `agents_v2.dispatch_stale_minutes` it goes through
 * the one normal path, `Approvals::dispatch`, which rechecks fingerprint, grant revision, connection generation, expiry and run
 * state and claims the action atomically (exactly once, however many sweepers and retries race). A failed recheck ends it `refused`
 * with a receipt. Only an action with no dispatch marker qualifies (`dispatched_at`, set with the claim): one that may have been
 * sent is the `dispatching` sweeper's, never this one's.
 *
 * Mac-executed actions (every browser action, every computer action but `open_draft_pr`) are claimed by the leased runner, never
 * dispatched from here: they are closed only once the run's lease has lapsed, a write as `unknown`, a read as retryable.
 */
final class StrandedApprovals
{
    private const LIMIT = 100;
    private const MAC_NEVER = ['computer' => 'The Mac did not pick this change up after it was approved, so it may not have run. Check the Agent worktree before approving it again.',
        'browser' => 'The Mac did not pick this form up after it was approved, so it may not have been submitted. Check the site before trying again.'];

    public function __construct(private readonly Approvals $approvals, private readonly Executor $executor, private readonly Lifecycle $lifecycle) {}

    /** @return array{dispatched: int, refused: int, unknown: int, failed: int} */
    public function sweep(int $minutes): array
    {
        $stats = ['dispatched' => 0, 'refused' => 0, 'unknown' => 0, 'failed' => 0];
        $before = now()->subMinutes($minutes);
        $due = ToolAction::query()->where('state', 'approved')->whereNull('dispatched_at')->where('updated_at', '<', $before)
            ->orderBy('updated_at')->limit(self::LIMIT)->pluck('id');
        foreach ($due as $id) {
            try { $state = $this->settle($id, $before); } catch (\Throwable $e) { report($e); continue; }
            if ($state !== null) $stats[$state]++;
        }
        return $stats;
    }

    /** @return 'dispatched'|'refused'|'unknown'|'failed'|null null when someone else settled it first or it is not due */
    private function settle(string $id, CarbonInterface $before): ?string
    {
        $action = ToolAction::query()->find($id);
        if (!$action || $action->state !== 'approved' || $action->dispatched_at !== null) return null;
        $connection = Connection::query()->find($action->connection_id);
        if ($connection && $this->onMac($action, $connection)) return $this->lapsed($action, $connection, $before);
        $done = $this->approvals->dispatch($id, $before);
        return $done === 'claimed' ? 'dispatched' : $done;
    }

    private function onMac(ToolAction $a, Connection $c): bool
    {
        return $c->provider === BrowserTools::PROVIDER || LocalMcpTools::isProvider($c->provider)
            || ($c->provider === ComputerTools::PROVIDER && ComputerTools::onMac($a->tool));
    }

    /** A Mac action nobody claimed: only once the lease lapsed is the Mac gone (a live one may still claim it). */
    private function lapsed(ToolAction $a, Connection $c, CarbonInterface $before): ?string
    {
        return DB::transaction(function () use ($a, $c, $before) {
            // Lock order is run → action, like cancel, approvals, Mac claims and the dispatching sweeper.
            $run = Run::query()->whereKey($a->run_id)->lockForUpdate()->first();
            $fresh = $run ? ToolAction::query()->whereKey($a->id)->lockForUpdate()->first() : null;
            if (!$fresh || $fresh->state !== 'approved' || $fresh->dispatched_at !== null || $fresh->updated_at->gt($before)) return null;
            if ($run->lease_expires_at !== null && $run->lease_expires_at->isFuture()) return null;
            if ($fresh->kind === 'write') {
                $this->executor->finish($fresh, 'unknown', 'unknown', 'outcome_unknown', ['error' => self::MAC_NEVER[$c->provider] ?? LocalMcpTools::NEVER, 'outcome' => 'outcome_unknown'], 'Outcome not confirmed');
                $state = 'unknown';
            } else {
                $this->executor->finish($fresh, 'failed', 'failed', 'retryable', ['error' => 'The Mac did not pick this request up. Try the call again.',
                    'outcome' => 'retryable', 'retryable' => true], 'The Mac did not answer');
                $state = 'failed';
            }
            if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
            return $state;
        });
    }
}
