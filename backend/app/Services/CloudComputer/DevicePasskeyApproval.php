<?php
namespace App\Services\CloudComputer;

use App\Models\{TrustedDevice, VibyraSession};
use App\Services\Remote\{RemotePresence, RemoteRestrictions, RemoteAccessException, RemoteDeviceProof};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Approves a pending phone of a cloud computer with a fresh passkey assertion instead of the Mac's sealed-box proof.
 * The assertion is a verified `authenticate` ceremony of this app session, account, device, host and generation,
 * at most 300 s old. Each ceremony can approve one device once; the strong-auth row it wrote stays valid for the
 * immediate connect, so one passkey tap covers approval and connect.
 */
class DevicePasskeyApproval
{
    /** Refusing a pending phone only restricts access, so a cloud computer needs no proof to do it. */
    public function deny(VibyraSession $session, string $hostId, string $uuid): TrustedDevice
    {
        return DB::transaction(function () use ($session, $hostId, $uuid) {
            $device = app(RemoteDeviceProof::class)->owned($session, $uuid);
            if ($device->host->host_id !== $hostId || $device->approved_at || $device->denied_at || $device->revoked_at
                || $device->authorization_generation !== $device->host->authorization_generation) {
                throw new RemoteAccessException('That device request expired or was already decided.', 409);
            }
            $revision = app(RemoteRestrictions::class)->advance($device->host);
            $device->forceFill(['denied_at' => now(), 'revoked_at' => now(), 'revocation_revision' => $revision])->save();
            app(RemotePresence::class)->audit($device->host, 'device.denied', ['device' => $device->device_name], $device->id);
            return $device;
        });
    }

    public function approve(VibyraSession $session, string $hostId, string $uuid, string $assertionId): TrustedDevice
    {
        $refused = fn (string $why = 'Verify your passkey on this phone to approve it.') => new RemoteAccessException($why, 403, 'cloud_passkey_required');
        if (! Str::isUuid($assertionId)) throw $refused();
        return DB::transaction(function () use ($session, $hostId, $uuid, $assertionId, $refused) {
            $device = app(RemoteDeviceProof::class)->owned($session, $uuid);
            $host = $device->host;
            if ($host->host_id !== $hostId || $device->approved_at || $device->denied_at || $device->revoked_at || $device->request_expires_at->lessThanOrEqualTo(now())
                || $device->authorization_generation !== $host->authorization_generation) {
                throw new RemoteAccessException('That device request expired or was already decided.', 409);
            }
            if (! app(HostAuthority::class)->passkeyApprovable($device, $host)) {
                throw new RemoteAccessException('This computer needs its own approval for new devices.', 403, 'cloud_passkey_not_allowed');
            }
            $window = min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300)));
            $ceremony = DB::table('remote_passkey_ceremonies')->where('id', $assertionId)->lockForUpdate()->first();
            if (! $ceremony || (int) $ceremony->user_id !== (int) $session->user_id || (int) $ceremony->app_session_id !== $session->id
                || (int) $ceremony->trusted_device_id !== $device->id || $ceremony->purpose !== 'authenticate' || $ceremony->verified_at === null
                || $ceremony->invalidated_at !== null || now()->subSeconds($window)->gt($ceremony->verified_at) || now()->lt($ceremony->verified_at)) {
                throw $refused();
            }
            if (TrustedDevice::where('approved_assertion_id', $assertionId)->exists()) throw $refused('That passkey verification was already used.');
            $strong = DB::table('remote_strong_auth as a')->join('passkey_credentials as p', 'p.id', '=', 'a.passkey_credential_id')
                ->where('a.app_session_id', $session->id)->where('a.trusted_device_id', $device->id)->where('p.user_id', $session->user_id)
                ->whereNull('p.revoked_at')->where('a.expires_at', '>', now())->exists();
            if (! $strong) throw $refused();
            $revision = app(RemoteRestrictions::class)->advance($host);
            $device->forceFill(['approved_at' => now(), 'approved_revision' => $revision, 'revocation_revision' => 0,
                'approved_via' => 'cloud_passkey', 'approved_assertion_id' => $assertionId])->save();
            app(RemotePresence::class)->audit($host, 'device.approved', ['device' => $device->device_name, 'via' => 'cloud_passkey'], $device->id);
            return $device;
        });
    }
}
