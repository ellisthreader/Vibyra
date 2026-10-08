<?php
namespace App\Services\CloudComputer;

use App\Models\{TrustedDevice, VibyraSession};
use App\Services\Remote\{RemoteAccessException, RemoteDeviceProof, RemotePresence, RemoteRestrictions, SecurityEvents};
use Illuminate\Support\Facades\DB;

/**
 * Approves a pending phone of the account's own cloud computer with Apple's Face ID sheet instead of a passkey page
 * (docs/start-route-contract.md): a fresh FaceKeys proof, sealed to the Face ID key this sign-in registered and bound to
 * this session, stands in for the passkey assertion. Same device checks as DevicePasskeyApproval; the strong-auth row it
 * writes covers the immediate connect. Off until CLOUD_FACE_APPROVAL, after its security review.
 */
class DeviceFaceApproval
{
    public function approve(VibyraSession $session, string $hostId, string $uuid, mixed $face): TrustedDevice
    {
        if (! config('cloud_workspaces.face_approval')) throw new RemoteAccessException('Verify your passkey on this phone to approve it.', 403, 'cloud_passkey_required');
        return DB::transaction(function () use ($session, $hostId, $uuid, $face) {
            $device = app(RemoteDeviceProof::class)->owned($session, $uuid);
            $host = $device->host;
            if ($host->host_id !== $hostId || $device->approved_at || $device->denied_at || $device->revoked_at || $device->request_expires_at->lessThanOrEqualTo(now())
                || $device->authorization_generation !== $host->authorization_generation) {
                throw new RemoteAccessException('That device request expired or was already decided.', 409);
            }
            if (! app(HostAuthority::class)->passkeyApprovable($device, $host)) {
                throw new RemoteAccessException('This computer needs its own approval for new devices.', 403, 'cloud_passkey_not_allowed');
            }
            try { app(FaceKeys::class)->verify($session, $face); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException $refused) {
                $code = (string) ($refused->getResponse()->getData(true)['code'] ?? 'face_required');
                throw new RemoteAccessException($code === 'face_sign_in_required'
                    ? 'Sign out and sign in again on this iPhone to use Face ID.' : 'Confirm with Face ID to approve this iPhone.', 403, $code);
            }
            $revision = app(RemoteRestrictions::class)->advance($host);
            $device->forceFill(['approved_at' => now(), 'approved_revision' => $revision, 'revocation_revision' => 0, 'approved_via' => 'cloud_face'])->save();
            DB::table('remote_strong_auth')->updateOrInsert(['app_session_id' => $session->id, 'trusted_device_id' => $device->id],
                ['method' => 'face', 'passkey_credential_id' => null, 'verified_at' => now(), 'visit_until' => null,
                    'expires_at' => now()->addSeconds(min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300))))]);
            app(RemotePresence::class)->audit($host, 'device.approved', ['device' => $device->device_name, 'via' => 'cloud_face'], $device->id);
            app(SecurityEvents::class)->record($session->user_id, 'FACE_ID_VERIFIED', ['device' => $device->device_name], $device->remote_host_id, $device->id);
            return $device;
        });
    }
}
