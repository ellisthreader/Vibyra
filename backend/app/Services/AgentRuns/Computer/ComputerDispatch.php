<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\{Connection, Grant, Run, ToolAction};
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentRuns\Tools\Approvals;

/**
 * The authority recheck immediately before a computer action runs: the same checks as
 * a connector write (grant revision, connection generation, fingerprint, expiry, live
 * run) plus the Mac grant itself, the leased Mac and any pinned GitHub account.
 */
final class ComputerDispatch
{
    /** Computer-specific part, also used by `Approvals::dispatch`. */
    public static function current(ToolAction $action, Run $run, Connection $connection): bool
    {
        if (!ComputerGrants::usable($run, $connection)) return false;
        $pin = $action->arguments['github'] ?? null;
        return !is_array($pin) || ComputerBinding::githubCurrent($pin) !== null;
    }

    /** Full recheck for a Mac claim; the caller holds the run and action locks. */
    public static function stale(ToolAction $action, Run $run, bool $expiry = true): bool
    {
        LegacyInstalls::sync($run->user_id);
        $grant = Grant::query()->whereKey($action->grant_id)->whereNull('revoked_at')->first();
        $connection = Connection::query()->whereKey($action->connection_id)->whereNull('revoked_at')->first();
        return $run->cancel_requested_at || RunStates::terminal($run->state)
            || !$grant || $grant->revision !== $action->grant_revision || !in_array($action->tool, $grant->operations ?? [], true)
            || !$connection || $connection->generation !== $action->connection_generation || $connection->health !== 'healthy'
            || ($expiry && $action->expires_at && $action->expires_at->isPast())
            || !hash_equals((string) $action->fingerprint, Approvals::fingerprint($action, $run->user_id))
            || !self::current($action, $run, $connection);
    }

    /** What the leased Mac needs to run one action; never another account's data. */
    public static function payload(ToolAction $a, Connection $c): array
    {
        return ['id' => $a->id, 'tool' => $a->tool, 'kind' => $a->kind, 'workspaceId' => $c->workspace_id,
            'state' => $a->state, 'fingerprint' => $a->fingerprint, 'claimedGeneration' => $a->claimed_generation === null ? null : (int) $a->claimed_generation,
            'arguments' => (object) collect($a->arguments ?? [])->except('github')->all(),
            'expiresAt' => $a->expires_at?->timestamp];
    }
}
