<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, Grant, Run, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\{ApiError, Events, Leases, Lifecycle, RunStates};
use App\Services\AgentRuns\Tools\{Approvals, Broker, Executor};
use Illuminate\Support\Facades\DB;

/**
 * The leased Mac's side of browser actions, fenced by lease generation: list,
 * claim (authority, sites and fingerprint rechecked at that instant), receipt.
 * A submit claimed under an older lease is never replayed: it becomes unknown.
 */
final class BrowserActions
{
    public function __construct(private readonly Leases $leases, private readonly Broker $broker,
        private readonly Executor $executor, private readonly Events $events, private readonly Lifecycle $lifecycle,
        private readonly BrowserReceipts $receipts) {}

    public function pending(RuntimeBinding $binding, string $runId, int $generation): array
    {
        return DB::transaction(function () use ($binding, $runId, $generation) {
            $run = $this->leases->fenced($binding, $runId, $generation, true);
            $actions = ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['approved', 'dispatching'])
                ->orderBy('created_at')->get();
            $connections = Connection::query()->whereIn('id', $actions->pluck('connection_id'))
                ->where('provider', BrowserTools::PROVIDER)->get()->keyBy('id');
            return $actions->filter(fn ($a) => isset($connections[$a->connection_id]))
                ->map(fn ($a) => self::payload($a, $connections[$a->connection_id]))->values()->all();
        });
    }

    public function claim(RuntimeBinding $binding, string $runId, string $actionId, int $generation, string $fingerprint): array
    {
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $fingerprint) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            $action = $this->locked($run, $actionId);
            if (!hash_equals((string) $action->fingerprint, $fingerprint))
                ApiError::throw(409, 'stale_fingerprint', 'This browser action changed. Fetch it again.');
            if ($action->state === 'pending_approval')
                ApiError::throw(409, 'not_approved', 'This browser action is still waiting for approval.');
            if ($action->state === 'approved') {
                if (self::stale($action, $run)) {
                    $action->forceFill(['state' => 'refused', 'summary' => 'Browser access changed before this ran',
                        'result' => ['error' => 'The teammate\'s allowed sites changed before this ran. Review it again.', 'reason' => 'grant_revoked']])->save();
                    $this->events->append($run, 'tool.refused', ['actionId' => $action->id, 'callId' => $action->call_id,
                        'tool' => $action->tool, 'reason' => 'grant_revoked', 'message' => 'Browser access changed before this ran.']);
                    $this->resume($run);
                    return $action;
                }
                if (!\App\Services\AgentRuns\Jobs\ResourceClaims::acquire($run, $action)) {
                    $this->resume($run); return $action;
                }
                $action->forceFill(['state' => 'dispatching', 'dispatched_at' => now(), 'claimed_generation' => $generation])->save();
            } elseif ($action->state === 'dispatching' && (int) $action->claimed_generation !== $generation) {
                if ($action->kind === 'read') $action->forceFill(['claimed_generation' => $generation])->save();
                else {
                    $this->executor->finish($action, 'unknown', 'unknown', 'outcome_unknown', ['error' => 'The Mac stopped while this '
                        .'form was being submitted. Check the site before trying again.', 'outcome' => 'outcome_unknown'], 'Outcome not confirmed');
                    $this->resume($run);
                }
            }
            return $action;
        });
        return self::payload($action, Connection::query()->findOrFail($action->connection_id))
            + ['outcome' => $this->broker->outcome($action)];
    }

    public function receipt(RuntimeBinding $binding, string $runId, string $actionId, int $generation, array $result): array
    {
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $result) {
            $run = $this->leases->fenced($binding, $runId, $generation, true, true);
            $action = $this->locked($run, $actionId);
            $key = 'mac:'.hash('sha256', json_encode($result));
            if (in_array($action->state, ['pending_approval', 'approved'], true) || (int) $action->claimed_generation !== $generation)
                ApiError::throw(409, 'not_claimed', 'Claim this browser action before posting its receipt.');
            if ($action->state !== 'dispatching') {
                $stored = \App\Models\AgentV2\Receipt::query()->where('action_id', $action->id)->value('idempotency_key');
                if ($stored === $key) return $action; // Duplicate: no-op.
                ApiError::throw(409, 'receipt_conflict', 'This browser action already has a different outcome.');
            }
            $this->receipts->record($action, $result, $key);
            $this->resume($run);
            return $action;
        });
        return $this->broker->outcome($action->fresh());
    }

    /** Grant, connection generation (sites), fingerprint, expiry and the Mac's browser support, rechecked. */
    public static function stale(ToolAction $action, Run $run): bool
    {
        $grant = Grant::query()->whereKey($action->grant_id)->whereNull('revoked_at')->first();
        $connection = Connection::query()->whereKey($action->connection_id)->whereNull('revoked_at')->first();
        return $run->cancel_requested_at || RunStates::terminal($run->state)
            || !$grant || $grant->revision !== $action->grant_revision || !in_array($action->tool, $grant->operations ?? [], true)
            || !$connection || $connection->generation !== $action->connection_generation || $connection->health !== 'healthy'
            || ($action->expires_at && $action->expires_at->isPast())
            || !hash_equals((string) $action->fingerprint, Approvals::fingerprint($action, $run->user_id))
            || !BrowserGrants::usable($run, $connection)
            || !isset(app(BrowserTools::class)->tools()[$action->tool]);
    }

    /** What the leased Mac needs: the action and the grant's sites (its profile is keyed by the connection). */
    public static function payload(ToolAction $a, Connection $c): array
    {
        return ['id' => $a->id, 'tool' => $a->tool, 'kind' => $a->kind, 'state' => $a->state, 'fingerprint' => $a->fingerprint,
            'claimedGeneration' => $a->claimed_generation === null ? null : (int) $a->claimed_generation,
            'arguments' => (object) ($a->arguments ?? []), 'expiresAt' => $a->expires_at?->timestamp,
            'browser' => ['connectionId' => $c->id, 'generation' => (int) $c->generation, 'origins' => $c->scopes ?? []]];
    }

    private function locked(Run $run, string $actionId): ToolAction
    {
        $action = ToolAction::query()->where('run_id', $run->id)->whereKey($actionId)->lockForUpdate()->first();
        if (!$action || Connection::query()->whereKey($action->connection_id)->value('provider') !== BrowserTools::PROVIDER)
            ApiError::throw(404, 'action_not_found', 'That browser action does not exist.');
        return $action;
    }

    private function resume(Run $run): void
    {
        if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
    }
}
