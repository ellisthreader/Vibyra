<?php

namespace App\Services\Remote;

use App\Models\{RemoteSession, TrustedDevice};

/** Only called inside the same transaction as authoritative admission/renewal. */
class RemoteAuthorizationLease
{
    public function issue(string $token): ?string
    {
        $claims = app(RelayTokens::class)->verify($token, true);
        if (($claims['role'] ?? null) !== 'client') return null;
        $session = RemoteSession::where('grant_id', $claims['jti'] ?? '')->whereNull('ended_at')
            ->whereNull('revoked_at')->lockForUpdate()->first();
        if (! $session || ! $session->admitted_at || ! $session->expires_at || $session->expires_at->lte(now())) return null;
        $device = TrustedDevice::whereKey($session->trusted_device_id)->first();
        if (! $device || ! $device->trusted() || $device->remote_host_id !== $session->remote_host_id
            || (string) $device->user_id !== (string) $session->user_id) return null;
        $permissions = $session->permissions ?? [];
        if (! is_array($permissions) || array_diff($permissions, $device->permissions ?? [])) return null;
        $host = $session->host;
        if (! $host || $host->revoked_at || $host->authorization_generation !== $session->authorization_generation
            || $host->authorization_generation !== $device->authorization_generation) return null;
        $now = now()->timestamp;
        return app(RemoteSessionTokens::class)->mint([
            'sessionId' => $session->grant_id, 'jti' => $session->grant_id,
            'sub' => (string) $session->user_id, 'generation' => $host->authorization_generation,
            'hostId' => $host->host_id, 'deviceId' => $device->public_key,
            'permissions' => array_values($permissions), 'iat' => $now,
            'exp' => min($now + 120, $session->expires_at->timestamp),
            'sessionExpiresAt' => $session->expires_at->timestamp,
        ]);
    }
}
