<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession};
use Illuminate\Support\Facades\DB;

/** Atomic grant consumption; relay renewals cannot create authorization. */
class RemoteSessionAuthorization
{
    public function allows(RemoteHost $host, array $claims, bool $renewal, ?int $activityAt = null): bool
    {
        if (! is_string($claims['jti'] ?? null)) return false;
        return DB::transaction(function () use ($host, $claims, $renewal, $activityAt) {
            $grant = RemoteSession::query()->where('grant_id', $claims['jti'])
                ->where('remote_host_id', $host->id)->where('user_id', $host->user_id)
                ->where('app_session_id', $claims['appSessionId'])
                ->where('authorization_generation', $host->authorization_generation)
                ->lockForUpdate()->first();
            if (! $grant || $grant->ended_at || $grant->revoked_at || ! $grant->expires_at) return false;
            if ($host->remote_access_mode === 'disabled' || ! $grant->trustedDevice?->trusted()
                || $grant->trustedDevice->remote_host_id !== $host->id || ! is_array($grant->permissions)
                || $grant->permissions === [] || array_diff($grant->permissions, $grant->trustedDevice->permissions ?? [])
                || ($claims['deviceId'] ?? null) !== $grant->trustedDevice->public_key
                || ($claims['permissions'] ?? null) !== $grant->permissions) return false;
            if ($grant->expires_at->lessThanOrEqualTo(now())) {
                $grant->forceFill(['status' => 'EXPIRED', 'ended_at' => now()])->save();
                return false;
            }
            if ($renewal) return $grant->admitted_at !== null
                && in_array($grant->status, ['CONNECTING', 'CONNECTED'], true)
                && app(RemoteSessionActivity::class)->renew($grant, $activityAt);
            if (! $grant->authorized_at || $grant->authorized_at->lte(now()->subMinutes(5))) {
                $grant->forceFill(['status' => 'EXPIRED', 'ended_at' => now()])->save();
                return false;
            }
            if ($grant->status !== 'AUTHORIZED' || $grant->admitted_at !== null) return false;
            // The predicate also protects engines where row locking is absent.
            return RemoteSession::query()->whereKey($grant->id)->where('status', 'AUTHORIZED')
                ->whereNull('admitted_at')->whereNull('ended_at')->whereNull('revoked_at')
                ->update(['admitted_at' => now(), 'last_activity_at' => now(), 'status' => 'CONNECTING']) === 1;
        });
    }
}
