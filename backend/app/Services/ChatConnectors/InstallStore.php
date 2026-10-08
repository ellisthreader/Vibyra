<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Facades\DB;

/** Keep an install reconnect and its Agent credential epoch atomic, even within the same second. */
final class InstallStore
{
    public static function put(array $where, array $values): void
    {
        DB::transaction(function () use ($where, $values) {
            // Match add-account order: owner -> connection -> install. A credential read uses connection -> install.
            DB::table('users')->where('id', $where['user_id'])->lockForUpdate()->first();
            $install = DB::table('vibes_integration_installs')->where($where)->first();
            $connection = $install ? DB::table('agent_connections')->where('install_id', $install->id)->lockForUpdate()->first() : null;
            if (!$install) {
                DB::table('vibes_integration_installs')->insert([...$where, ...$values, 'created_at' => now()]);
                return;
            }
            DB::table('vibes_integration_installs')->where('id', $install->id)->update($values);
            if ($connection && !$connection->revoked_at && $connection->external_identity === $values['account_label']) {
                // connected_at has second precision; timestamp comparison alone misses rapid reconnects.
                DB::table('agent_connections')->where('id', $connection->id)->update([
                    'generation' => DB::raw('generation + 1'), 'install_connected_at' => $values['connected_at'],
                    'health' => 'healthy', 'scope_issue' => null, 'updated_at' => now()]);
            }
            // A different identity is detached by LegacyInstalls; credential resolution already refuses that mismatch.
        });
    }
}
