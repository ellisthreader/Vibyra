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
        $strong = DB::table('remote_strong_auth')->join('passkey_credentials', 'passkey_credentials.id', '=', 'remote_strong_auth.passkey_credential_id')
            ->where('remote_strong_auth.app_session_id', $session->id)->where('remote_strong_auth.trusted_device_id', $device->id)
            ->where('passkey_credentials.user_id', $session->user_id)->whereNull('passkey_credentials.revoked_at')
            ->where('remote_strong_auth.expires_at', '>', now())
            ->where('remote_strong_auth.verified_at', '>=', now()->subSeconds(min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300)))))
            ->where('remote_strong_auth.verified_at', '<=', now())->exists();
        if (! $strong) throw new RemoteAccessException('Verify your passkey before connecting.', 403, 'strong_auth_required');
        return app(RemoteDeviceProof::class)->consume($session, $device->uuid, 'connect', $request['challengeId'], $request['proof'], $permissions);
    }
}
