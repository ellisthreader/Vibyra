<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Support\Facades\DB;

final class Shutdown
{
    public function request(int $user, string $id, string $reason = 'user_stop'): object
    {
        return DB::transaction(function () use ($user, $id, $reason) {
            app(Wallet::class)->lock($user);
            $w = app(Workspaces::class)->owned($user, $id);
            if (!in_array($w->state, Workspaces::ACTIVE, true)) return $w;
            DB::table('cloud_workspaces')->where('id', $id)->update(['state' => 'stopping', 'stop_reason' => $reason,
                'stop_requested_at' => $w->stop_requested_at ?? now(), 'revision' => $w->revision + 1, 'updated_at' => now()]);
            DB::table('cloud_actions')->where('workspace_id', $id)->where('state', 'queued')->update(['state' => 'cancelled', 'updated_at' => now()]);
            foreach ($w->chat_id ? DB::table('vibes_turns')->where('chat_id', $w->chat_id)->whereNull('settled_at')->get() : [] as $turn) {
                DB::table('vibes_turns')->where('id', $turn->id)->update(['cancel_requested' => true]);
                if (in_array($turn->status, ['queued', 'waiting'], true)) app(Turns::class)->settle($turn->id, (int) $turn->actual_micro_usd, null, 'Cloud computer stopped. Confirmed AI usage only.');
            }
            return app(Workspaces::class)->owned($user, $id);
        }, 5);
    }
    public function confirm(object $original): void
    {
        DB::transaction(function () use ($original) {
            app(Wallet::class)->lock($original->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $original->id)->lockForUpdate()->firstOrFail();
            if ($w->generation !== $original->generation || !in_array($w->state, Workspaces::ACTIVE, true)) return;
            app(Meter::class)->settle($w, true);
            DB::table('cloud_actions')->where('workspace_id', $w->id)->where('state', 'running')
                ->update(['state' => 'unknown', 'updated_at' => now()]);
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'stopped', 'bootstrap_secret' => null,
                'runtime_secret' => null, 'runtime_token_hash' => null, 'lease_until' => null, 'revision' => $w->revision + 1,
                'retention_until' => now()->addDays(config('cloud_workspaces.archive_days')), 'updated_at' => now()]);
            app(\App\Services\CloudComputer\HostActivity::class)->slept($w);
        }, 5);
    }
}
