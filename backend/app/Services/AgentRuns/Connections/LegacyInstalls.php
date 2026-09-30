<?php

namespace App\Services\AgentRuns\Connections;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Compatibility mapping from `vibes_integration_installs` (one row per user and
 * slug) to `agent_connections` (stable IDs, many accounts per provider). The
 * install row stays the credential store for its account, so ordinary chat and
 * the v1 engine keep working unchanged.
 */
final class LegacyInstalls
{
    /**
     * Give every existing install a connection ID: chunked by id, idempotent (the unique `install_id` decides), safe to
     * run repeatedly and while the app is live. `$after` resumes past an id; `$deadline` (a microtime) stops between chunks.
     *
     * @return int the last install id visited (resume with it), or `$after` when there was nothing more
     */
    public static function backfill(?int $userId = null, ?float $deadline = null, int $after = 0): int
    {
        $last = $after;
        $query = DB::table('vibes_integration_installs')->where('id', '>', $after);
        if ($userId !== null) $query->where('user_id', $userId);
        $query->chunkById(200, function ($installs) use (&$last, $deadline) {
            foreach ($installs as $install) { self::syncOne($install); $last = (int) $install->id; }
            return $deadline === null || microtime(true) < $deadline;
        });
        return $last;
    }

    /** Align one account's connections with its current install rows. */
    public static function sync(int $userId): void
    {
        DB::transaction(function () use ($userId) {
            $installs = DB::table('vibes_integration_installs')->where('user_id', $userId)->get()->keyBy('id');
            foreach ($installs as $install) self::syncOne($install);
            $orphans = DB::table('agent_connections')->where('user_id', $userId)->whereNotNull('install_id')
                ->whereNull('revoked_at')->get();
            foreach ($orphans as $row) if (!$installs->has($row->install_id)) self::detach($row);
            \App\Services\AgentRuns\Computer\ComputerGrants::sync($userId); // Mac folder grants → computer connections.
        });
    }

    private static function syncOne(object $install): void
    {
        $row = DB::table('agent_connections')->where('install_id', $install->id)->first();
        $identity = $install->account_label !== null ? (string) $install->account_label : null;
        $health = Cache::has('chat-connectors:reconnect:'.$install->user_id.':'.$install->integration)
            ? 'reconnect_required' : 'healthy';
        if ($row && ($row->revoked_at || $row->external_identity !== $identity || $row->provider !== $install->integration)) {
            // A different account now sits behind this install: the old ID and its grants end here.
            self::detach($row);
            $row = null;
        }
        if (!$row) {
            // Two requests can be first to see a new install; the loser waits on the unique install_id and inserts nothing.
            DB::table('agent_connections')->insertOrIgnore(['id' => (string) Str::uuid(), 'user_id' => $install->user_id,
                'provider' => $install->integration, 'external_identity' => $identity, 'install_id' => $install->id,
                'install_connected_at' => $install->connected_at, 'generation' => 1, 'capability_revision' => 1,
                'health' => $health, 'created_at' => now(), 'updated_at' => now()]);
            return;
        }
        $changes = [];
        if ((string) $row->install_connected_at !== (string) $install->connected_at) {
            // Reconnected the same account: new credential generation, fresh health.
            $changes = ['generation' => $row->generation + 1, 'install_connected_at' => $install->connected_at,
                'health' => $health];
        } elseif ($row->health !== 'reconnect_required' && $row->health !== $health) {
            // A provider refusal seen by the broker is cleared only by a reconnect.
            $changes['health'] = $health;
        }
        if ($changes !== []) DB::table('agent_connections')->where('id', $row->id)->update([...$changes, 'updated_at' => now()]);
    }

    public static function detach(object $row): void
    {
        DB::table('agent_connections')->where('id', $row->id)->update(['install_id' => null,
            'revoked_at' => $row->revoked_at ?? now(), 'health' => 'revoked', 'updated_at' => now()]);
        DB::table('agent_grants')->where('connection_id', $row->id)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
    }
}
