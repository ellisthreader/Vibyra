<?php
namespace App\Services\CloudComputer;

use App\Models\{RemoteHost, TrustedDevice};
use Illuminate\Support\Facades\DB;

/** Authority questions about cloud-bound hosts, asked from the shared remote-access services. */
class HostAuthority
{
    /** A host relay token that names a cloud workspace is valid only while that computer is booting or up. */
    public function allows(RemoteHost $host, mixed $workspaceId): bool
    {
        return is_string($workspaceId) && DB::table('cloud_workspaces')->where('id', $workspaceId)->where('kind', 'computer')
            ->where('user_id', $host->user_id)->where('remote_host_id', $host->id)->whereIn('state', ['starting', 'ready'])->exists();
    }

    public function bound(RemoteHost $host): bool
    {
        return DB::table('cloud_workspaces')->where('kind', 'computer')->where('remote_host_id', $host->id)->where('user_id', $host->user_id)->where('state', '!=', 'deleted')->exists();
    }

    /**
     * A cloud computer has no Mac to approve a new phone, so a FRESH PASSKEY ASSERTION replaces the Mac's proof.
     * Nothing is ever approved silently: this only says whether a pending device may be decided that way.
     */
    public function passkeyApprovable(TrustedDevice $device, RemoteHost $host): bool
    {
        return $host->remote_access_mode === 'trusted' && ! $host->revoked_at && (string) $host->user_id === (string) $device->user_id
            && $device->remote_host_id === $host->id && $device->authorization_generation === $host->authorization_generation
            && ! $device->approved_at && ! $device->denied_at && ! $device->revoked_at
            && $device->request_expires_at !== null && $device->request_expires_at->isFuture() && $this->bound($host);
    }
}
