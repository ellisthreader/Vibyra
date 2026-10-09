<?php

namespace App\Services\AgentRuns\LocalMcp;

use App\Models\AgentV2\{Connection, Grant, McpServer, Receipt, Run, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\{ApiError, Events, Leases, Lifecycle, RunStates};
use App\Services\AgentRuns\Mcp\{McpServers, ToolList};
use App\Services\AgentRuns\Tools\{Approvals, Broker, Executor};
use Illuminate\Support\Facades\DB;

/**
 * The leased Mac's side of local MCP actions, fenced by lease generation: list, claim (authority, host, grant,
 * connection generation, fingerprint AND the server's live tool catalogue rechecked at that instant), receipt.
 * A write claimed under an older lease is never replayed: it becomes unknown.
 */
final class LocalMcpActions
{
    public function __construct(private readonly Leases $leases, private readonly Broker $broker, private readonly Executor $executor,
        private readonly Events $events, private readonly Lifecycle $lifecycle, private readonly LocalMcpReceipts $receipts,
        private readonly McpServers $servers) {}

    public function pending(RuntimeBinding $binding, string $runId, int $generation): array
    {
        return DB::transaction(function () use ($binding, $runId, $generation) {
            $run = $this->leases->fenced($binding, $runId, $generation, true);
            $actions = ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['approved', 'dispatching'])->orderBy('created_at')->get();
            $servers = McpServer::query()->whereIn('connection_id', $actions->pluck('connection_id'))->where('kind', 'local')->get()->keyBy('connection_id');
            $connections = Connection::query()->whereIn('id', $servers->keys())->get()->keyBy('id');
            return $actions->filter(fn ($a) => isset($servers[$a->connection_id], $connections[$a->connection_id]))
                ->map(fn ($a) => self::payload($a, $servers[$a->connection_id], $connections[$a->connection_id]))->values()->all();
        });
    }

    /**
     * @param array<int, array>|null $live the tools the Mac's server lists right now (re-posted at every claim)
     * @param array{reason: string, error: string}|null $unavailable instead of `$live`: the server could not be started or listed
     */
    public function claim(RuntimeBinding $binding, string $runId, string $actionId, int $generation, string $fingerprint, ?array $live, ?array $unavailable = null): array
    {
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $fingerprint, $live, $unavailable) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            $action = $this->locked($run, $actionId);
            if (!hash_equals((string) $action->fingerprint, $fingerprint))
                ApiError::throw(409, 'stale_fingerprint', 'This local MCP action changed. Fetch it again.');
            if ($action->state === 'pending_approval')
                ApiError::throw(409, 'not_approved', 'This local MCP action is still waiting for approval.');
            if ($action->state === 'approved') {
                if (self::stale($action, $run)) return $this->refuse($run, $action, 'grant_revoked', 'Access to this local server changed before this ran. Review it again.');
                // The Mac could not start or reach the server: the call is closed as refused, visibly, and nothing was sent.
                if ($unavailable !== null) return $this->refuse($run, $action, $unavailable['reason'], $unavailable['error']);
                if ($live === null) ApiError::throw(422, 'tools_required', 'Send the tools the server lists now.');
                if ($this->changed($action, $live)) return $this->refuse($run, $action, 'tools_changed',
                    'This MCP server changed its tools. The person must review the new list before teammates can use it again.');
                if (!\App\Services\AgentRuns\Jobs\ResourceClaims::acquire($run, $action)) {
                    $this->resume($run); return $action;
                }
                $action->forceFill(['state' => 'dispatching', 'dispatched_at' => now(), 'claimed_generation' => $generation])->save();
            } elseif ($action->state === 'dispatching' && (int) $action->claimed_generation !== $generation) {
                if ($action->kind === 'read') $action->forceFill(['claimed_generation' => $generation])->save();
                else {
                    $this->executor->finish($action, 'unknown', 'unknown', 'outcome_unknown', ['error' => LocalMcpTools::STOPPED, 'outcome' => 'outcome_unknown'], 'Outcome not confirmed');
                    $this->resume($run);
                }
            }
            return $action;
        });
        $server = McpServer::query()->where('connection_id', $action->connection_id)->firstOrFail();
        return self::payload($action, $server, Connection::query()->findOrFail($action->connection_id)) + ['outcome' => $this->broker->outcome($action)];
    }

    public function receipt(RuntimeBinding $binding, string $runId, string $actionId, int $generation, array $result): array
    {
        $action = DB::transaction(function () use ($binding, $runId, $actionId, $generation, $result) {
            $run = $this->leases->fenced($binding, $runId, $generation, true, true);
            $action = $this->locked($run, $actionId);
            $key = 'mac:'.hash('sha256', json_encode($result));
            if (in_array($action->state, ['pending_approval', 'approved'], true) || (int) $action->claimed_generation !== $generation)
                ApiError::throw(409, 'not_claimed', 'Claim this local MCP action before posting its receipt.');
            if ($action->state !== 'dispatching') {
                if (Receipt::query()->where('action_id', $action->id)->value('idempotency_key') === $key) return $action; // Duplicate: no-op.
                ApiError::throw(409, 'receipt_conflict', 'This local MCP action already has a different outcome.');
            }
            $this->receipts->record($action, $result, $key);
            $this->resume($run);
            return $action;
        });
        return $this->broker->outcome($action->fresh());
    }

    /** Grant, connection generation, fingerprint, expiry, host and the server's registration, rechecked. */
    public static function stale(ToolAction $action, Run $run): bool
    {
        $grant = Grant::query()->whereKey($action->grant_id)->whereNull('revoked_at')->first();
        $connection = Connection::query()->whereKey($action->connection_id)->whereNull('revoked_at')->first();
        $tools = $connection ? ($server = LocalMcpGrants::server($connection)) ? (new LocalMcpTools($server))->tools() : [] : [];
        return $run->cancel_requested_at || RunStates::terminal($run->state)
            || !$grant || $grant->revision !== $action->grant_revision || !in_array($action->tool, $grant->operations ?? [], true)
            || !$connection || $connection->generation !== $action->connection_generation || $connection->health !== 'healthy'
            || ($action->expires_at && $action->expires_at->isPast())
            || !hash_equals((string) $action->fingerprint, Approvals::fingerprint($action, $run->user_id))
            || !LocalMcpGrants::usable($run, $connection) || !isset($tools[$action->tool]) || $tools[$action->tool] !== $action->kind;
    }

    /** True when the live catalogue is not the pinned one (and holds it for review). */
    private function changed(ToolAction $action, array $live): bool
    {
        $server = McpServer::query()->where('connection_id', $action->connection_id)->lockForUpdate()->firstOrFail();
        $normalised = ToolList::normalise($live, $server->slug);
        if ($normalised['revision'] === $server->tool_revision) return false;
        $this->servers->observe($server, Connection::query()->findOrFail($server->connection_id), $normalised);
        return true;
    }

    private function refuse(Run $run, ToolAction $action, string $reason, string $message): ToolAction
    {
        $action->forceFill(['state' => 'refused', 'summary' => mb_substr($message, 0, 255), 'result' => ['error' => $message, 'reason' => $reason]])->save();
        $this->events->append($run, 'tool.refused', ['actionId' => $action->id, 'callId' => $action->call_id, 'tool' => $action->tool,
            'reason' => $reason, 'message' => $message]);
        $this->resume($run);
        return $action;
    }

    /** What the leased Mac needs: the action, which of its servers, and the tool's own name there. */
    public static function payload(ToolAction $a, McpServer $s, Connection $c): array
    {
        $tool = collect($s->tools ?? [])->firstWhere('tool', $a->tool);
        return ['id' => $a->id, 'tool' => $a->tool, 'kind' => $a->kind, 'state' => $a->state, 'fingerprint' => $a->fingerprint,
            'claimedGeneration' => $a->claimed_generation === null ? null : (int) $a->claimed_generation,
            'arguments' => (object) ($a->arguments ?? []), 'expiresAt' => $a->expires_at?->timestamp,
            'server' => ['connectionId' => $c->id, 'localId' => $s->local_id, 'generation' => (int) $c->generation,
                'remoteName' => $tool['remote'] ?? null, 'toolRevision' => $s->tool_revision]];
    }

    private function locked(Run $run, string $actionId): ToolAction
    {
        $action = ToolAction::query()->where('run_id', $run->id)->whereKey($actionId)->lockForUpdate()->first();
        $local = $action && McpServer::query()->where('connection_id', $action->connection_id)->where('kind', 'local')->exists();
        if (!$action || !$local) ApiError::throw(404, 'action_not_found', 'That local MCP action does not exist.');
        return $action;
    }

    private function resume(Run $run): void
    {
        if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
    }
}
