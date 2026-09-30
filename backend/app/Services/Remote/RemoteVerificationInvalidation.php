<?php

namespace App\Services\Remote;

use App\Models\TrustedDevice;
use Illuminate\Support\Facades\DB;

/** Caller holds the host lock; invalidate even ceremonies already being verified. */
class RemoteVerificationInvalidation
{
    public function host(int $hostId): void
    {
        $devices = TrustedDevice::where('remote_host_id', $hostId)->pluck('id');
        DB::table('remote_device_challenges')->whereIn('trusted_device_id', $devices)->delete();
        DB::table('remote_strong_auth')->whereIn('trusted_device_id', $devices)->delete();
        DB::table('remote_passkey_ceremonies')->whereIn('trusted_device_id', $devices)
            ->update(['consumed_at' => now(), 'invalidated_at' => now()]);
        DB::table('remote_host_security_challenges')->where('remote_host_id', $hostId)->delete();
    }
}
