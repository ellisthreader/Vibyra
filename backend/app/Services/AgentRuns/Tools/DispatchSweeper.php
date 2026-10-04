<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\{Connection, Run, ToolAction};
use App\Services\AgentRuns\Browser\BrowserTools;
use App\Services\AgentRuns\Computer\ComputerTools;
use App\Services\AgentRuns\LocalMcp\LocalMcpTools;
use App\Services\AgentRuns\{Lifecycle, RunStates};
use Illuminate\Support\Facades\{Cache, DB};

/**
 * Closes an action a dead process left `dispatching` (the API or worker died mid-call), which otherwise blocks the
 * runner's `/complete` with `actions_open` for ever. A write is NEVER sent again: one read-only lookup for the exact
 * change first (Gmail Message-ID, Calendar event id, Linear/Notion entity id, Slack metadata, Outlook transactionId),
 * confirmed when found, otherwise `unknown` with an `outcome_unknown` receipt, so the run ends `outcome_unknown` or is
 * cancelled with the write shown unknown. A read has no side effect and fails retryable. A Mac-claimed action waits for
 * lease loss too (a live, heartbeating Mac may be mid-test); a branch publish in phase `uploaded` never wrote anything.
 * An action left `approved` (no claim, nothing sent) is the one exception that IS dispatched: see StrandedApprovals.
 */
final class DispatchSweeper
{
    /** A queued publish job may wait and then run up to its 15 minute timeout before its action counts as stranded. */
    private const PHASE_MINUTES = 20;
    private const MAC_STOPPED = ['computer' => 'The Mac stopped while this change was running. Check the Agent worktree before approving it again.',
        'browser' => 'The Mac stopped while this form was being submitted. Check the site before trying again.'];

    public function __construct(private readonly Executor $executor, private readonly Lifecycle $lifecycle,
        private readonly StrandedApprovals $stranded) {}

    /** @return array{confirmed: int, unknown: int, failed: int, dispatched: int, refused: int} actions closed or dispatched by this sweep */
    public function sweep(): array
    {
        $stats = ['confirmed' => 0, 'unknown' => 0, 'failed' => 0, 'dispatched' => 0, 'refused' => 0];
        $due = ToolAction::query()->where('state', 'dispatching')->where('updated_at', '<', now()->subMinutes($this->minutes()))
            ->orderBy('updated_at')->limit(200)->pluck('id');
        foreach ($due as $id) {
            try { $state = $this->settle($id); } catch (\Throwable $e) { report($e); continue; }
            if ($state !== null) $stats[$state]++;
        }
        // Then what a crash left `approved` before any claim: nothing was sent, so it is dispatched once (or refused), see StrandedApprovals.
        foreach ($this->stranded->sweep($this->minutes()) as $state => $n) $stats[$state] += $n;
        return $stats;
    }

    private function minutes(): int
    {
        return max(1, (int) config('agents_v2.dispatch_stale_minutes', 5));
    }

    /** @return 'confirmed'|'unknown'|'failed'|null null when someone else settled it first or it is not stale */
    private function settle(string $id): ?string
    {
        $action = ToolAction::query()->find($id);
        $run = $action?->state === 'dispatching' ? Run::query()->find($action->run_id) : null;
        if (!$run || !$this->stale($action, $run)) return null;
        // One sweeper per action at a time, so racing sweeps look it up once rather than each asking the provider.
        $lock = Cache::lock('agents-v2:sweep:'.$id, 120);
        if (!$lock->get()) return null;
        try {
            if ($action->refresh()->state !== 'dispatching') return null; // settled while we waited for the lock
            $connection = Connection::query()->find($action->connection_id);
            // The provider lookup is one read; it runs before any row lock is taken so a slow provider never blocks the run.
            $found = $connection && $action->kind === 'write' && $action->phase === null && !$this->local($connection)
                ? $this->executor->lookup($action, $connection) : null;
            return DB::transaction(function () use ($action, $connection, $found) {
                // Lock order is run → action, like cancel, approvals, Mac claims and the publish job.
                $run = Run::query()->whereKey($action->run_id)->lockForUpdate()->first();
                $fresh = $run ? ToolAction::query()->whereKey($action->id)->lockForUpdate()->first() : null;
                if (!$fresh || $fresh->state !== 'dispatching' || !$this->stale($fresh, $run)) return null;
                $state = $this->close($fresh, $connection, $found);
                if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
                return $state;
            });
        } finally { $lock->release(); }
    }

    private function stale(ToolAction $a, Run $run): bool
    {
        $minutes = $a->phase === null ? $this->minutes() : max($this->minutes(), self::PHASE_MINUTES);
        $since = $a->phase === null ? ($a->dispatched_at ?? $a->updated_at) : $a->updated_at;
        if ($since->gt(now()->subMinutes($minutes))) return false;
        // A Mac that still holds the run's lease is alive; only a lapsed lease means the claiming Mac is gone. A publish in a phase
        // is past the Mac (its upload arrived): the server job owns it, whatever the lease says.
        return $a->phase !== null || $a->claimed_generation === null || $run->lease_expires_at === null || $run->lease_expires_at->isPast();
    }

    private function close(ToolAction $a, ?Connection $c, ?array $found): string
    {
        $key = ['idempotencyKey' => 'publish:'.$a->id];
        if ($a->phase === 'uploaded') { // The job reserves `uploaded` → `writing` before touching GitHub, and now finds the action closed.
            $this->executor->finish($a, 'failed', 'failed', 'refused', ['published' => false, 'refused' => true, 'outcome' => 'refused',
                'reason' => 'publication_not_started', 'error' => 'The GitHub publication did not start. Nothing was written.'], 'Branch not published', $key);
            return 'failed';
        }
        if ($a->phase === 'writing') return $this->unknown($a, 'The GitHub branch outcome was not confirmed. Inspect the repository before retrying.', 'Branch outcome unconfirmed', $key);
        if ($a->kind === 'write' && (!$c || $this->local($c))) {
            $mac = $c && $a->claimed_generation !== null;
            return $this->unknown($a, $mac ? (self::MAC_STOPPED[$c->provider] ?? LocalMcpTools::STOPPED) : 'Vibyra stopped while this change was running. Check the provider before approving it again.', 'Outcome not confirmed');
        }
        if (!$c) { // A read whose connection is gone: nothing to ask, nothing was changed.
            $this->executor->finish($a, 'failed', 'failed', 'refused', ['error' => 'The connection was removed.', 'outcome' => 'refused'], 'Connection removed');
            return 'failed';
        }
        $this->executor->settleLost($a, $c, $found);
        return $a->state === 'completed' ? 'confirmed' : ($a->state === 'unknown' ? 'unknown' : 'failed');
    }

    private function unknown(ToolAction $a, string $error, string $summary, array $confirmed = []): string
    {
        $this->executor->finish($a, 'unknown', 'unknown', 'outcome_unknown', ['error' => $error, 'outcome' => 'outcome_unknown'], $summary, $confirmed);
        return 'unknown';
    }

    /** Mac folder and browser actions run on the leased Mac; `open_draft_pr` and the GitHub half of a publish run on the server under the same provider. */
    private function local(Connection $c): bool
    {
        return in_array($c->provider, [ComputerTools::PROVIDER, BrowserTools::PROVIDER], true) || LocalMcpTools::isProvider($c->provider);
    }
}
