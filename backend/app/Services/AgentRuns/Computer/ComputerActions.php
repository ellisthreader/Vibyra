<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\{Connection, Run, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\{ApiError, Events, Leases, Lifecycle, RunStates};
use App\Services\AgentRuns\Tools\{Broker, Executor};
use Illuminate\Support\Facades\DB;

/**
 * The leased Mac's side of computer actions, fenced by the run's lease generation:
 * list what it may run, claim one (authority rechecked at that instant), post its
 * receipt. A write claimed under an older generation is never replayed: the new
 * runner's claim settles it as unknown.
 */
final class ComputerActions
{
    public function __construct(private readonly Leases $leases, private readonly Broker $broker,
        private readonly Executor $executor, private readonly Events $events, private readonly Lifecycle $lifecycle,
        private readonly ComputerReceipts $receipts) {}

    public function pending(RuntimeBinding $binding, string $runId, int $generation): array
    {
        return DB::transaction(function () use ($binding, $runId, $generation) {
            $run = $this->leases->fenced($binding, $runId, $generation, true);
            $actions = ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['approved', 'dispatching'])
                ->orderBy('created_at')->get();
            $connections = Connection::query()->whereIn('id', $actions->pluck('connection_id'))
                ->where('provider', ComputerTools::PROVIDER)->get()->keyBy('id');
            return $actions->filter(fn ($a) => isset($connections[$a->connection_id]) && ComputerTools::onMac($a->tool))
                ->map(fn ($a) => ComputerDispatch::payload($a, $connections[$a->connection_id]))->values()->all();
        });
    }

    public function claim(RuntimeBinding $binding, string $runId, string $actionId, int $generation, string $fingerprint): array
    {
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $fingerprint) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            $action = $this->locked($run, $actionId);
            if (!hash_equals((string) $action->fingerprint, $fingerprint))
                ApiError::throw(409, 'stale_fingerprint', 'This computer action changed. Fetch it again.');
            if ($action->state === 'pending_approval')
                ApiError::throw(409, 'not_approved', 'This computer action is still waiting for approval.');
            if ($action->state === 'approved') {
                if (ComputerDispatch::stale($action, $run)) {
                    $action->forceFill(['state' => 'refused', 'summary' => 'Access changed before this ran',
                        'result' => ['error' => 'Access to this computer changed before the action ran.', 'reason' => 'grant_revoked']])->save();
                    $this->events->append($run, 'tool.refused', ['actionId' => $action->id, 'callId' => $action->call_id,
                        'tool' => $action->tool, 'reason' => 'grant_revoked', 'message' => 'Access changed before this ran.']);
                    $this->resume($run);
                    return $action;
                }
                $action->forceFill(['state' => 'dispatching', 'dispatched_at' => now(), 'claimed_generation' => $generation])->save();
            } elseif ($action->state === 'dispatching' && (int) $action->claimed_generation !== $generation) {
                if ($action->kind === 'read') $action->forceFill(['claimed_generation' => $generation])->save();
                else $this->abandoned($action, $run);
            }
            return $action;
        });
        return ComputerDispatch::payload($action, Connection::query()->findOrFail($action->connection_id))
            + ['outcome' => $this->broker->outcome($action)];
    }

    public function receipt(RuntimeBinding $binding, string $runId, string $actionId, int $generation, array $result): array
    {
        $publish = null;
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $result, &$publish) {
            // A late receipt after cancellation is still recorded: the change already happened.
            $run = $this->leases->fenced($binding, $runId, $generation, true);
            $action = $this->locked($run, $actionId);
            $hash = hash('sha256', json_encode($result));
            if (in_array($action->state, ['pending_approval', 'approved'], true))
                ApiError::throw(409, 'not_claimed', 'Claim this computer action before posting its receipt.');
            if ($action->state !== 'dispatching' || $action->phase !== null) {
                $stored = \App\Models\AgentV2\Receipt::query()->where('action_id', $action->id)->value('idempotency_key');
                if ($stored === 'mac:'.$hash || ($action->phase !== null && isset($result['upload']))) return $action; // Duplicate: no-op.
                ApiError::throw(409, 'receipt_conflict', 'This computer action already has a different outcome.');
            }
            if ((int) $action->claimed_generation !== $generation)
                ApiError::throw(409, 'not_claimed', 'Claim this computer action before posting its receipt.');
            $publish = $this->receipts->record($action, $result, 'mac:'.$hash);
            $this->resume($run);
            return $action;
        });
        if ($publish) app(ComputerPublish::class)->queue($action->id, $publish);
        return $this->broker->outcome($action->fresh());
    }

    private function locked(Run $run, string $actionId): ToolAction
    {
        $action = ToolAction::query()->where('run_id', $run->id)->whereKey($actionId)->lockForUpdate()->first();
        $connection = $action ? Connection::query()->find($action->connection_id) : null;
        if (!$action || $connection?->provider !== ComputerTools::PROVIDER || !ComputerTools::onMac($action->tool))
            ApiError::throw(404, 'action_not_found', 'That computer action does not exist.');
        return $action;
    }

    /** The Mac that claimed this write lost its lease: its outcome can only be unknown. */
    private function abandoned(ToolAction $action, Run $run): void
    {
        $this->executor->finish($action, 'unknown', 'unknown', 'outcome_unknown', ['error' => 'The Mac stopped while this change was running. '
            .'Check the Agent worktree before approving it again.', 'outcome' => 'outcome_unknown'], 'Outcome not confirmed');
        $this->resume($run);
    }

    private function resume(Run $run): void
    {
        if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
    }
}
