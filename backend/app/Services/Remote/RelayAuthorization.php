<?php
namespace App\Services\Remote;

use App\Models\{RemoteHost, VibyraSession};
use Illuminate\Support\Facades\DB;

/** Renewable transport permission, independent of token admission expiry. */
class RelayAuthorization
{
    public function allows(string $token, bool $renewal, ?int $activityAt = null): bool
    {
        return DB::transaction(fn () => $this->authorize($token, $renewal, $activityAt));
    }

    private function authorize(string $token, bool $renewal, ?int $activityAt): bool
    {
        $claims = app(RelayTokens::class)->verify($token, $renewal);
        if (! $claims || ! in_array($claims['role'] ?? null, ['host', 'client'], true)
            || ! is_int($claims['generation'] ?? null) || ! is_int($claims['appSessionId'] ?? null)
            || ! is_string($claims['hostId'] ?? null) || ! is_string($claims['userId'] ?? null)) return false;
        $host = RemoteHost::query()->where('host_id', $claims['hostId'])->whereNull('revoked_at')->lockForUpdate()->first();
        if (! $host || (string) $host->user_id !== $claims['userId']
            || $host->authorization_generation !== $claims['generation']) return false;
        // A cloud computer's host has no phone session: its authority is the running, account-owned workspace bound to this host row.
        if (isset($claims['cloudWorkspace'])) return $claims['role'] === 'host' && app(\App\Services\CloudComputer\HostAuthority::class)->allows($host, $claims['cloudWorkspace']);
        $session = VibyraSession::query()->whereKey($claims['appSessionId'])->where('user_id', $host->user_id)
            ->whereNull('revoked_at')->first();
        if (! $session || ! $session->absolute_expires_at || ! $session->idle_expires_at
            || $session->absolute_expires_at->lessThanOrEqualTo(now()) || $session->idle_expires_at->lessThanOrEqualTo(now())) return false;
        if ($claims['role'] === 'host') return true;
        $until = $claims['accessUntil'] ?? null;
        if ($until !== null && (! is_int($until) || $until <= time())) return false;
        if (! app(RemoteAccess::class)->availability($host->user)['entitled']) return false;
        return app(RemoteSessionAuthorization::class)->allows($host, $claims, $renewal, $activityAt);
    }
}
