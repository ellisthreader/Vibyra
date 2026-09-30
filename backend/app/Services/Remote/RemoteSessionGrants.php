<?php

namespace App\Services\Remote;

use App\Models\RemoteSession;

class RemoteSessionGrants
{
    public function payload(RemoteSession $session): array
    {
        $host = $session->host;
        $base = ['sessionId' => $session->grant_id, 'authorizationId' => $session->grant_id, 'status' => $session->status,
            'permissions' => $session->permissions, 'sessionExpiresAt' => $session->expires_at->toIso8601String(),
            'host' => app(RemoteAccess::class)->describe($host)];
        if ($session->status !== 'AUTHORIZED') return $base;
        $membership = app(\App\Services\Membership\Entitlements::class)->for($host->user);
        $until = $membership['paidUntil'] ? \Illuminate\Support\Carbon::parse($membership['paidUntil'])->addMinutes(15)->timestamp : null;
        $ttl = max(1, min(300, (int) config('remote.client_token_seconds')));
        return $base + ['relayUrl' => app(RelayGateway::class)->publicUrl(), 'expiresIn' => $ttl, 'accessUntil' => $until,
            'token' => app(RelayTokens::class)->mint(['generation' => $session->authorization_generation,
                'appSessionId' => $session->app_session_id, 'accessUntil' => $until, 'sessionExpiresAt' => $session->expires_at->timestamp,
                'role' => 'client', 'hostId' => $host->host_id, 'userId' => (string) $session->user_id, 'jti' => $session->grant_id,
                'deviceId' => $session->trustedDevice->public_key, 'permissions' => $session->permissions], $ttl)];
    }
}
