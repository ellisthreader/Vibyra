<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** Remove stored Microsoft access, retaining factual/uncertain action history. */
return new class extends Migration
{
    public function up(): void
    {
        $providers = ['outlook_mail', 'outlook_calendar', 'onedrive', 'teams', 'sharepoint'];
        DB::transaction(function () use ($providers): void {
            $connections = DB::table('agent_connections')->whereIn('provider', $providers)->pluck('id');
            DB::table('agent_grants')->whereIn('connection_id', $connections)->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
            DB::table('agent_approval_rules')->whereIn('connection_id', $connections)->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'updated_at' => now()]);
            DB::table('agent_connections')->whereIn('provider', $providers)->update([
                'credential' => null, 'refresh_token' => null, 'expires_at' => null, 'health' => 'revoked',
                'revoked_at' => now(), 'generation' => DB::raw('generation + 1'), 'updated_at' => now(),
            ]);
            DB::table('vibes_integration_installs')->whereIn('integration', $providers)->delete();
            DB::table('agent_teammates')->orderBy('id')->each(function ($row) use ($providers): void {
                $before = (array) json_decode($row->integrations, true);
                $after = array_values(array_diff($before, $providers));
                if ($before === $after) return;
                DB::table('agent_teammates')->where('id', $row->id)->update(['integrations' => json_encode($after),
                    'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
                DB::table('vibes_chats')->where('id', $row->chat_id)->increment('revision');
            });
            $identities = DB::table('agent_channel_identities')->where('provider', 'teams')->pluck('id');
            $bindings = DB::table('agent_channel_bindings')->whereIn('identity_id', $identities)->pluck('id');
            DB::table('agent_channel_bindings')->whereIn('id', $bindings)->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
            DB::table('agent_channel_events')->whereIn('binding_id', $bindings)->where('state', 'pending')
                ->update(['state' => 'cancelled', 'updated_at' => now()]);
        });
    }

    public function down(): void
    {
        // Removed credentials and approvals must never be restored by rollback.
    }
};
