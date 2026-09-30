<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\{Connection, Run};
use App\Services\Agents\{VmPlatform, WorkspaceRevocation};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Maps the existing Mac folder grants (`agent_workspaces`, created only by the Mac's
 * own folder picker for one teammate) onto V2 connections and grants. Pairing or a
 * registered runtime never creates one. The workspace stays the source of truth:
 * its scopes and the Agent Computer flags decide the operations; revoking the V2
 * connection or grant ends the Mac grant too, so a removal is never undone by a sync.
 */
final class ComputerGrants
{
    private const READS = ['workspace_list', 'workspace_read', 'workspace_search'];
    private const EDITS = ['workspace_changes', 'workspace_edit', 'publish_branch', 'open_draft_pr'];

    public static function sync(int $userId): void
    {
        $workspaces = DB::table('agent_workspaces')->where('user_id', $userId)->get();
        if ($workspaces->isEmpty()) return;
        $rows = DB::table('agent_connections')->where('user_id', $userId)->where('provider', ComputerTools::PROVIDER)
            ->get()->keyBy('workspace_id');
        foreach ($workspaces as $ws) {
            $row = $rows[$ws->id] ?? null;
            if ($ws->revoked_at) {
                if ($row && !$row->revoked_at) self::end($row->id);
                continue;
            }
            if ($row?->revoked_at) {
                app(WorkspaceRevocation::class)->revoke($userId, $ws->id); // Removed on the V2 side.
                continue;
            }
            $ops = self::operations($ws);
            if (!$row) {
                if ($ops !== []) self::create($ws, $ops);
                continue;
            }
            if ((int) $row->generation !== (int) $ws->revision || $row->external_identity !== $ws->label)
                DB::table('agent_connections')->where('id', $row->id)->update(['generation' => (int) $ws->revision,
                    'external_identity' => $ws->label, 'updated_at' => now()]);
            self::alignGrant($userId, $ws, $row->id, $ops);
        }
    }

    /** Operations the Mac grant and the current flags allow; never more than the Mac chose. */
    public static function operations(object $ws): array
    {
        $ops = self::READS;
        if ($ws->can_write) $ops = [...$ops, ...self::EDITS];
        if (VmPlatform::allows($ws)) $ops[] = 'run_test';
        $ops = array_values(array_intersect($ops, array_keys(app(ComputerTools::class)->tools())));
        sort($ops);
        return $ops;
    }

    public static function workspace(Connection $connection): ?object
    {
        return $connection->workspace_id ? DB::table('agent_workspaces')->where('id', $connection->workspace_id)
            ->where('user_id', $connection->user_id)->whereNull('revoked_at')->first() : null;
    }

    /** Only the Mac that holds the folder (and understands computer tools) may be offered them. */
    public static function usable(Run $run, Connection $connection): bool
    {
        $ws = self::workspace($connection);
        $runtime = $run->runtime_snapshot ?? [];
        return $ws !== null && (string) $ws->agent_id === (string) $run->agent_id
            && hash_equals((string) $ws->host_id, (string) ($runtime['hostId'] ?? ''))
            && (($runtime['capabilities']['computerTools'] ?? false) === true);
    }

    private static function create(object $ws, array $ops): void
    {
        $id = (string) Str::uuid();
        // Two requests can be first to see a new folder grant; the loser waits on the unique workspace_id and
        // creates neither row (the winner's connection and grant commit together with its sync transaction).
        $created = DB::table('agent_connections')->insertOrIgnore(['id' => $id, 'user_id' => $ws->user_id, 'provider' => ComputerTools::PROVIDER,
            'external_identity' => $ws->label, 'workspace_id' => $ws->id, 'generation' => (int) $ws->revision,
            'capability_revision' => 1, 'health' => 'healthy', 'created_at' => now(), 'updated_at' => now()]);
        if (!$created) return;
        DB::table('agent_grants')->insert(['id' => (string) Str::uuid(), 'user_id' => $ws->user_id, 'agent_id' => $ws->agent_id,
            'connection_id' => $id, 'operations' => json_encode($ops), 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
    }

    private static function alignGrant(int $userId, object $ws, string $connectionId, array $ops): void
    {
        $grants = DB::table('agent_grants')->where('connection_id', $connectionId)->where('agent_id', $ws->agent_id)->get();
        $active = $grants->firstWhere('revoked_at', null);
        if (!$active) {
            if ($grants->isNotEmpty()) { // The person removed it on the V2 side: end the Mac grant too.
                app(WorkspaceRevocation::class)->revoke($userId, $ws->id);
                self::end($connectionId);
            }
            else DB::table('agent_grants')->insert(['id' => (string) Str::uuid(), 'user_id' => $userId, 'agent_id' => $ws->agent_id,
                'connection_id' => $connectionId, 'operations' => json_encode($ops), 'revision' => 1,
                'created_at' => now(), 'updated_at' => now()]);
            return;
        }
        // Flags off keep the grant with no operations, so turning them back on restores it.
        if (json_decode($active->operations, true) !== $ops) DB::table('agent_grants')->where('id', $active->id)
            ->update(['operations' => json_encode($ops), 'revision' => $active->revision + 1, 'updated_at' => now()]);
    }

    private static function end(string $connectionId): void
    {
        DB::table('agent_connections')->where('id', $connectionId)->update(['revoked_at' => now(), 'health' => 'revoked',
            'updated_at' => now()]);
        DB::table('agent_grants')->where('connection_id', $connectionId)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
    }
}
