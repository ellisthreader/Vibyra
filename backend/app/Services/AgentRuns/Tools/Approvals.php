<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Grant;
use App\Models\AgentV2\Run;
use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\AgentRuns\Events;
use App\Services\AgentRuns\Lifecycle;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentRuns\Computer\{ComputerDispatch, ComputerPullRequest, ComputerTools};
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Exact write approval. The fingerprint binds owner, run, action, connection
 * generation, grant revision, canonical arguments, schema and policy revision.
 * Dispatch rechecks all of it and claims the action atomically, so a duplicate
 * approval or retry never executes twice.
 */
final class Approvals
{
    public function __construct(private readonly Executor $executor, private readonly Events $events,
        private readonly Lifecycle $lifecycle) {}

    public static function fingerprint(ToolAction $a, int $userId): string
    {
        return Canonical::hash(['user' => $userId, 'run' => $a->run_id, 'action' => $a->id, 'call' => $a->call_id,
            'tool' => $a->tool, 'connection' => $a->connection_id, 'generation' => $a->connection_generation,
            'grant' => $a->grant_id, 'grantRevision' => $a->grant_revision, 'arguments' => $a->arguments,
            'schema' => $a->schema_revision, 'policy' => (int) config('agents_v2.policy_revision', 1)]);
    }

    public function decide(int $userId, string $actionId, string $fingerprint, string $decision): ToolAction
    {
        $approved = DB::transaction(function () use ($userId, $actionId, $fingerprint, $decision) {
            // Lock order is run → action everywhere (cancel, broker, Mac claims). Taking the action first deadlocked
            // with a concurrent cancel on Postgres: one of the two callers got a 500 and the cancel could be the victim.
            $runId = ToolAction::query()->whereKey($actionId)->where('user_id', $userId)->value('run_id');
            if (!$runId) ApiError::throw(404, 'action_not_found', 'That action does not exist.');
            $run = Run::query()->whereKey($runId)->lockForUpdate()->firstOrFail();
            $action = ToolAction::query()->whereKey($actionId)->where('user_id', $userId)->lockForUpdate()->first();
            if (!$action) ApiError::throw(404, 'action_not_found', 'That action does not exist.');
            if (!hash_equals((string) $action->fingerprint, $fingerprint))
                ApiError::throw(409, 'stale_fingerprint', 'This action changed. Refresh and review it again.');
            if ($action->state !== 'pending_approval') {
                if ($action->decision === $decision) return null; // Duplicate decision: no second dispatch.
                ApiError::throw(409, 'already_decided', 'This action was already decided.');
            }
            if ($run->cancel_requested_at || RunStates::terminal($run->state))
                ApiError::throw(409, 'run_cancelled', 'This task is no longer running.');
            if ($action->expires_at && $action->expires_at->isPast()) {
                $this->close($action, $run, 'expired', null, 'Approval expired');
                return 'expired'; // Committed before refusing, so the expiry is journalled.
            }
            if ($decision === 'decline') {
                $this->close($action, $run, 'declined', 'decline', 'Declined');
                return null;
            }
            $action->forceFill(['state' => 'approved', 'decision' => 'allow'])->save();
            $this->events->append($run, 'approval.decided', ['actionId' => $action->id, 'decision' => 'allow']);
            if ($run->state === RunStates::WAITING_APPROVAL) $this->lifecycle->move($run, RunStates::RUNNING);
            return ['dispatch' => $action->id];
        });
        if ($approved === 'expired')
            ApiError::throw(409, 'approval_expired', 'This approval expired. Ask the teammate to prepare it again.');
        if (is_array($approved)) $this->dispatch($approved['dispatch']);
        return ToolAction::query()->whereKey($actionId)->firstOrFail();
    }

    /**
     * Claim an approved action exactly once, recheck its authority, then execute. `dispatched_at` is the durable claim marker,
     * written in the same transaction as the `dispatching` state, so an `approved` action without it was never started and one
     * with it is never claimed again. The sweeper passes `$strandedBefore` for an action a crash left `approved`: it is then
     * dispatched only if it has been approved since before that instant, and a refusal also leaves a receipt.
     *
     * @return 'claimed'|'refused'|null what this call did; null when nothing was due (taken already, left for the Mac, too fresh)
     */
    public function dispatch(string $actionId, ?CarbonInterface $strandedBefore = null): ?string
    {
        $refused = false;
        $claimed = DB::transaction(function () use ($actionId, $strandedBefore, &$refused) {
            $runId = ToolAction::query()->whereKey($actionId)->value('run_id'); // run → action, like cancel (see decide)
            if (!$runId) return null;
            $run = Run::query()->whereKey($runId)->lockForUpdate()->firstOrFail();
            $action = ToolAction::query()->whereKey($actionId)->lockForUpdate()->first();
            if (!$action || $action->state !== 'approved' || $action->dispatched_at !== null) return null;
            if ($strandedBefore && $action->updated_at->gt($strandedBefore)) return null; // approved too recently to be stranded
            LegacyInstalls::sync($run->user_id);
            $grant = Grant::query()->whereKey($action->grant_id)->whereNull('revoked_at')->first();
            $connection = Connection::query()->whereKey($action->connection_id)->whereNull('revoked_at')->first();
            $stale = $run->cancel_requested_at || RunStates::terminal($run->state)
                || !$grant || $grant->revision !== $action->grant_revision || !in_array($action->tool, $grant->operations ?? [], true)
                || !$connection || $connection->generation !== $action->connection_generation || $connection->health !== 'healthy'
                || ($action->expires_at && $action->expires_at->isPast())
                || !hash_equals((string) $action->fingerprint, self::fingerprint($action, $run->user_id));
            if (!$stale && $connection->provider === \App\Services\AgentRuns\Browser\BrowserTools::PROVIDER) {
                // A browser submit stays approved; the leased Mac claims it (BrowserActions rechecks everything).
                if (!\App\Services\AgentRuns\Browser\BrowserActions::stale($action, $run)) return null;
                $stale = true;
            }
            $computer = !$stale && $connection->provider === ComputerTools::PROVIDER;
            if ($stale || ($computer && !ComputerDispatch::current($action, $run, $connection))) {
                $why = $action->expires_at && $action->expires_at->isPast() ? 'Approval expired before this action ran' : 'Access changed before this action ran';
                $this->close($action, $run, 'refused', 'allow', $why, $strandedBefore !== null);
                $refused = true;
                return null;
            }
            if ($computer && ComputerTools::onMac($action->tool)) return null; // Stays approved: the leased Mac claims it.
            $action->forceFill(['state' => 'dispatching', 'dispatched_at' => now()])->save();
            return [$action, $connection];
        });
        if ($claimed && $claimed[1]->provider === ComputerTools::PROVIDER) app(ComputerPullRequest::class)->execute($claimed[0]);
        elseif ($claimed) $this->executor->execute(...$claimed);
        return $claimed ? 'claimed' : ($refused ? 'refused' : null);
    }

    /** `$receipt`: nobody is waiting on a swept action, so the refusal is also written as a receipt and a `tool.result` the runner and the feed can read. */
    private function close(ToolAction $action, Run $run, string $state, ?string $decision, string $summary, bool $receipt = false): void
    {
        $action->forceFill(['state' => $state, 'decision' => $decision, 'summary' => $summary,
            'result' => ['error' => $summary.'.']])->save();
        $this->events->append($run, 'approval.decided', ['actionId' => $action->id, 'decision' => $decision ?? 'none', 'state' => $state]);
        if ($receipt) $this->executor->finish($action, $state, 'failed', 'refused', ['error' => $summary.'.', 'outcome' => 'refused'], $summary);
        if ($run->state === RunStates::WAITING_APPROVAL) $this->lifecycle->move($run, RunStates::RUNNING);
    }
}
