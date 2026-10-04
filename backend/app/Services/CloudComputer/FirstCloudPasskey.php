<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\DB;

/**
 * An account with no passkey can create its first one from a pending phone of its cloud computer, so a cloud-only
 * user (no paired Mac) is not stuck. That is the one place a not-yet-approved device may start a `register` ceremony,
 * and the passkey it creates is also the proof that approves that phone (one tap, not two).
 *
 * Guards, all required: the switch is on (off by default until the security review of the diff); the account has no
 * unrevoked passkey (a later passkey still needs an existing-passkey assertion); the session was created recently
 * (a bearer stolen long ago cannot race the owner to enrol first); and nothing is signed in on the computer yet. The
 * pending device itself is already limited to a trusted, cloud-bound host of the same account and generation.
 */
class FirstCloudPasskey
{
    public function allows(VibyraSession $session, object $device): bool
    {
        if (! config('remote_security.first_cloud_passkey')) return false;
        if (DB::table('passkey_credentials')->where('user_id', $session->user_id)->whereNull('revoked_at')->exists()) return false;
        $window = max(60, (int) config('remote_security.first_cloud_passkey_session_seconds', 3600));
        if (! $session->created_at || $session->created_at->lt(now()->subSeconds($window))) return false;
        $computer = DB::table('cloud_workspaces')->where('remote_host_id', $device->remote_host_id)->where('user_id', $session->user_id)
            ->where('kind', 'computer')->where('state', '!=', 'deleted')->first();
        return $computer !== null && ! $computer->login_claude && ! $computer->login_codex;
    }
}
