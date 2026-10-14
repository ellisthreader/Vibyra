<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/** Foreground viewer intent is a short lease, distinct from terminal/Host traffic. */
final class PreviewActivity
{
    public function renew(VibyraSession $s, array $d): array
    {
        return DB::transaction(function () use ($s, $d) {
            app(Wallet::class)->lock($s->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $d['workspaceId'])->where('user_id', $s->user_id)
                ->where('kind', 'computer')->lockForUpdate()->first();
            abort_unless(config('cloud_preview.enabled') && $w && $w->state === 'ready'
                && $w->generation === (int) $d['generation'] && $w->remote_host_id && $w->lease_until && now()->lt($w->lease_until), 409, 'Cloud Preview is no longer running.');
            $grants = \App\Models\RemoteSession::query()->where('user_id', $s->user_id)->where('app_session_id', $s->id)
                ->where('remote_host_id', $w->remote_host_id)->where('status', 'CONNECTED')->whereNull('ended_at')->whereNull('revoked_at')
                ->where('expires_at', '>', now())->get();
            $auth = $grants->contains(fn ($g) => $g->trustedDevice?->trusted() && $g->trustedDevice->remote_host_id === $w->remote_host_id
                && $g->authorization_generation === $g->trustedDevice->authorization_generation
                && in_array('preview:access', $g->trustedDevice->permissions ?? [], true) && in_array('preview:access', $g->permissions ?? [], true));
            abort_unless($auth, 403, 'Confirm this device before keeping Cloud Preview awake.');
            $until = now()->addSeconds(config('cloud_preview.activity_seconds'));
            $viewers = DB::table('cloud_preview_viewers')->where('workspace_id',$w->id);
            $key = ['workspace_id'=>$w->id,'app_session_id'=>$s->id];
            if ($d['visible']) DB::table('cloud_preview_viewers')->updateOrInsert($key,['generation'=>$w->generation,'active_until'=>$until]);
            else DB::table('cloud_preview_viewers')->where($key)->delete();
            $active=(clone $viewers)->where('generation',$w->generation)->where('active_until','>',now())->max('active_until');
            $viewers->where('active_until','<=',now())->delete();
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['preview_active_until' => $active,
                'last_activity_at' => now(), 'updated_at' => now()]);
            return ['activeUntil' => $d['visible'] ? $until->toIso8601String() : null];
        }, 5);
    }
}
