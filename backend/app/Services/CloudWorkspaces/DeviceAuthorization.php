<?php
namespace App\Services\CloudWorkspaces;

use App\Models\{TrustedDevice, VibyraSession};
use App\Services\Remote\RemoteDeviceProof;
use Illuminate\Support\Facades\DB;

/** Managed enrollment reuses existing possession + UV passkey evidence, never Mac approval fiction. */
final class DeviceAuthorization
{
    public function device(VibyraSession $session, string $id): TrustedDevice
    {
        $device = app(RemoteDeviceProof::class)->owned($session, $id);
        abort_unless($device->trusted() && $device->authorization_generation === $device->host->authorization_generation
            && $device->host->remote_access_mode !== 'disabled', 403, 'Approve this device in Remote access before hosting a project.');
        $strong = DB::table('remote_strong_auth as a')->join('passkey_credentials as p', 'p.id', '=', 'a.passkey_credential_id')
            ->where('a.app_session_id', $session->id)->where('a.trusted_device_id', $device->id)
            ->where('p.user_id', $session->user_id)->whereNull('p.revoked_at')->where('a.expires_at', '>', now())
            ->where('a.verified_at', '>=', now()->subMinutes(5))->where('a.verified_at', '<=', now())->exists();
        abort_unless($strong, 403, 'Verify your passkey before authorizing a cloud computer.');
        return $device;
    }
    public static function purpose(string $operation, string $scope): string
    {
        return 'cw:'.$operation.':'.substr(hash('sha256', $scope), 0, 20);
    }
    public function challenge(VibyraSession $session, string $id, string $purpose): array
    {
        $device = $this->device($session, $id);
        return app(RemoteDeviceProof::class)->issue($session, $device, $purpose, $device->public_key);
    }
    public function consume(VibyraSession $session, string $deviceId, string $challenge, string $proof, string $purpose): TrustedDevice
    {
        $device = $this->device($session, $deviceId);
        app(RemoteDeviceProof::class)->consumeFor($session, $device, $purpose, $challenge, $proof);
        return $device;
    }
}
