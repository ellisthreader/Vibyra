<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\DB;

/** Account authentication and permission to reach a computer remain separate. */
class RequireRemoteAccessAuthorization
{
    public function verify(VibyraSession $session, RemoteHost $host, array $request): TrustedDevice
    {
        if ((string) $host->user_id !== (string) $session->user_id || $host->revoked_at) {
            throw new RemoteAccessException('That computer is not available.', 404);
        }
        if ($host->remote_access_mode === 'disabled') throw new RemoteAccessException('Remote access is disabled on this computer.', 403, 'remote_disabled');
        foreach (['deviceId', 'challengeId', 'proof'] as $key) {
            if (! is_string($request[$key] ?? null) || $request[$key] === '') {
                throw new RemoteAccessException('Update Vibyra to verify this device before connecting.', 403, 'remote_authorization_required');
            }
        }
        $permissions = RemotePermissions::normalize($request['permissions'] ?? []);
        if ($permissions === []) throw new RemoteAccessException('Choose at least one remote permission.', 422);
        $device = app(RemoteDeviceProof::class)->owned($session, $request['deviceId']);
        if ($device->remote_host_id !== $host->id || ! $device->trusted()) {
            throw new RemoteAccessException('This device has not been approved for this computer.', 403, 'device_not_trusted');
        }
        // One Face ID (or passkey) per visit: see RemoteVisit.
        if (! app(RemoteVisit::class)->confirmed($session, $device)) throw new RemoteAccessException('Confirm it’s you before connecting.', 403, 'strong_auth_required');
        $device = app(RemoteDeviceProof::class)->consume($session, $device->uuid, 'connect', $request['challengeId'], $request['proof'], $permissions);
        app(RemoteVisit::class)->touch($session->id, $device->id);
        return $device;
    }
}
