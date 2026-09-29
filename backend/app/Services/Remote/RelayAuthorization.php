<?php
namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, VibyraSession};

/** Renewable transport permission, independent of token admission expiry. */
class RelayAuthorization
{
    public function allows(string $token, bool $renewal): bool
    {
        $claims = app(RelayTokens::class)->verify($token, $renewal);
        if (! $claims || ! in_array($claims['role'] ?? null, ['host', 'client'], true)
            || ! is_int($claims['generation'] ?? null) || ! is_int($claims['appSessionId'] ?? null)
            || ! is_string($claims['hostId'] ?? null) || ! is_string($claims['userId'] ?? null)) return false;
        $host = RemoteHost::query()->where('host_id', $claims['hostId'])->whereNull('revoked_at')->first();
        if (! $host || (string) $host->user_id !== $claims['userId']
            || $host->authorization_generation !== $claims['generation']) return false;
        $session = VibyraSession::query()->whereKey($claims['appSessionId'])->where('user_id', $host->user_id)
            ->whereNull('revoked_at')->first();
        if (! $session || ! $session->absolute_expires_at || ! $session->idle_expires_at
            || $session->absolute_expires_at->lessThanOrEqualTo(now()) || $session->idle_expires_at->lessThanOrEqualTo(now())) return false;
        if ($claims['role'] === 'host') return true;
        $grant = $claims['jti'] ?? null;
        if (! is_string($grant) || ! RemoteSession::query()->where('grant_id', $grant)
            ->where('remote_host_id', $host->id)->where('user_id', $host->user_id)
            ->where('authorization_generation', $host->authorization_generation)->whereNull('ended_at')->exists()) return false;
        $until = $claims['accessUntil'] ?? null;
        if ($until !== null && (! is_int($until) || $until <= time())) return false;
        return app(RemoteAccess::class)->availability($host->user)['entitled'];
    }
}
