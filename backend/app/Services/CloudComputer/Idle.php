<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Eligibility;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Lifecycle::stopReason for the cloud computer: Host-reported work keeps it up, until the deadline. */
class Idle
{
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
        if (now()->gte(Carbon::parse($w->last_activity_at)->addSeconds(config('cloud_workspaces.idle_seconds')))) return 'idle';
        return null;
    }
}
