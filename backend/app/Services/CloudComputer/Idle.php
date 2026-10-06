<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Eligibility;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Lifecycle::stopReason for the cloud computer: Host-reported work and synced work keep it up, until the deadline. */
class Idle
{
    /** Synced work that stops moving (no upload, apply or Mac progress for this long) no longer holds the computer up. */
    public const SYNC_STALL_SECONDS = 1800;

    public function stopReason(object $w): ?string
    {
        if (!$w->lease_until || now()->gte($w->lease_until)) return 'compute_lease_expired';
        if (now()->gte($w->deadline_at)) return 'deadline';
        try { app(Eligibility::class)->authorize($w->user_id); }
        catch (\Throwable) { return 'entitlement_or_payment'; }
        if ($w->remote_host_id && DB::table('remote_hosts')->where('id', $w->remote_host_id)->whereNotNull('revoked_at')->exists()) return 'authority_revoked';
        // Everyone signed out (logout everywhere, password reset, deletion in progress): nobody may keep it running.
        if (!DB::table('vibyra_sessions')->where('user_id', $w->user_id)->whereNull('revoked_at')->where('absolute_expires_at', '>', now())->exists()) return 'authority_revoked';
        // Included hours are spent and overage is blocked: stop rather than run unpaid.
        if (app(\App\Services\CloudWorkspaces\Allowance::class)->exhaustedAndBlocked((int) $w->user_id)) return 'allowance_exhausted';
        if (app(Computers::class)->active($w) > 0) return null;
        // Booted but the Host never reached the relay: stop with an error instead of showing "starting" forever.
        if ($this->neverConnected($w)) return 'host_unreachable';
        // Uploads waiting to be applied, an apply under way, or a Mac still sending: stay up while it keeps moving (every upload,
        // apply and Mac progress report refreshes last_activity_at), then the usual idle tail.
        if (app(SyncKeys::class)->workFor((int) $w->user_id) && now()->lt(Carbon::parse($w->last_activity_at)->addSeconds(self::SYNC_STALL_SECONDS))) return null;
        if (now()->gte(Carbon::parse($w->last_activity_at)->addSeconds(config('cloud_workspaces.idle_seconds')))) return 'idle';
        return null;
    }

    private function neverConnected(object $w): bool
    {
        if (!$w->ready_at || now()->lt(Carbon::parse($w->ready_at)->addSeconds(config('cloud_workspaces.computer_connect_seconds')))) return false;
        $seen = $w->remote_host_id ? DB::table('remote_hosts')->where('id', $w->remote_host_id)->value('last_seen_at') : null;
        return !$seen || Carbon::parse($seen)->lt($w->ready_at);
    }
}
