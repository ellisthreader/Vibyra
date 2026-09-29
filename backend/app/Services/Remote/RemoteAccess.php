<?php

namespace App\Services\Remote;

use App\Models\RemoteHost;
use App\Models\RemoteSession;
use App\Models\User;
use App\Services\Vibes\Plans;
use Illuminate\Support\Facades\DB;

/** Owned computer registrations and transport credentials; remote session
 * authorization and independently signed Host leases have separate services. */
class RemoteAccess
{
    public function __construct(
        private readonly RelayTokens $tokens,
        private readonly RelayGateway $gateway,
        private readonly RemotePresence $presence,
        private readonly Plans $plans,
    ) {
    }

    /** Whether remote access works at all, and whether this account may use it. */
    public function availability(User $user): array
    {
        $live = $this->gateway->configured() && $this->plans->remoteAccessLive();
        $entitled = ! config('remote.require_plan') || (bool) $this->plans->for(app(\App\Services\Membership\Entitlements::class)->for($user)['plan'])['remoteAccess'];

        return ['live' => $live, 'entitled' => $entitled];
    }

    /** A computer signing in: upserts its row and hands it a registration token. */
    public function register(User $user, string $hostId, string $name, ?string $platform, ?string $version, ?int $appSessionId = null, ?string $challengeId = null, ?string $proof = null): array
    {
        $host = DB::transaction(function () use ($user, $hostId, $name, $platform, $version, $appSessionId, $challengeId, $proof) {
            // Serialize per-account registration limits. Existing host ownership
            // never moves without a separately reviewed device proof protocol.
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $host = RemoteHost::query()->where('host_id', $hostId)->lockForUpdate()->first();
            $moving = $host && (string) $host->user_id !== (string) $user->id;
            app(RemoteIdentityProof::class)->consume($user, $appSessionId, $hostId, $host, $challengeId, $proof);
            $owned = RemoteHost::query()->where('user_id', $user->id)->whereNull('revoked_at')->where('host_id', '!=', $hostId)->count();
            if ($owned >= (int) config('remote.max_hosts_per_user')) throw new RemoteAccessException('Remove a computer before enrolling another.', 409);
            if ($moving) {
                $host->authorization_generation++;
                app(RemoteRestrictions::class)->ownershipChanged($host);
                $host->sessions()->whereNull('ended_at')->update(['ended_at' => now(), 'revoked_at' => now(), 'status' => 'REVOKED']);
                app(RemoteRevocations::class)->queue($hostId, $host->authorization_generation);
            }
            $host ??= new RemoteHost(['host_id' => $hostId, 'remote_access_mode' => 'disabled',
                'authorization_generation' => max(1, (int) DB::table('remote_revocations')->where('host_id', $hostId)->max('generation'))]);
            if ($moving || $host->revoked_at !== null) {
                app(RemoteVerificationInvalidation::class)->host($host->id);
                $host->forceFill(['online_until' => null, 'last_seen_at' => null, 'relay_id' => null,
                    'remote_access_mode' => 'disabled', 'security_enabled_at' => null]);
            }
            $host->forceFill(['user_id' => $user->id, 'name' => $name, 'platform' => $platform, 'app_version' => $version,
                'registered_at' => now(), 'revoked_at' => null])->save();
            return $host;
        });
        app(RemoteRevocations::class)->deliver($hostId);
        $this->presence->audit($host, 'host.registered');
        $ttl = (int) config('remote.host_token_seconds');

        return ['host' => $this->describe($host), 'relayUrl' => $this->gateway->publicUrl(), 'expiresIn' => $ttl,
            'securityRevision' => (int) $host->security_revision,
            'authorizationKey' => app(RemoteSessionTokens::class)->publicKey(),
            'authorizationContext' => ['userId' => (string) $user->id, 'generation' => $host->authorization_generation],
            'token' => $this->tokens->mint(['generation' => $host->authorization_generation, 'appSessionId' => $appSessionId, 'role' => 'host', 'hostId' => $hostId, 'userId' => (string) $user->id], $ttl)];
    }

    /** @return list<array<string,mixed>> */
    public function computers(User $user): array
    {
        return RemoteHost::query()->where('user_id', $user->id)->whereNull('revoked_at')
            ->withCount(['sessions as active_sessions' => fn ($query) => $query->where('status', 'CONNECTED')->whereNull('ended_at')->where('expires_at', '>', now())])
            ->orderByDesc('online_until')->orderBy('name')->get()->map(fn (RemoteHost $host) => $this->describe($host))->all();
    }

    /** A phone asking to reach one of the account's computers: a fresh grant, or the reason there is none. */
    public function connect(User $user, string $hostId, ?string $clientName, ?int $appSessionId = null, array $authorization = []): array
    {
        $availability = $this->availability($user);
        if (! $availability['live']) {
            throw new RemoteAccessException('Remote access is not available yet.', 503);
        }
        if (! $availability['entitled']) {
            throw new RemoteAccessException('Connecting from anywhere is part of Pro. Your computer still works on the same Wi-Fi.', 403);
        }
        return app(RemoteSessionCreation::class)->create($user, $hostId, $clientName, $appSessionId, $authorization);
    }

    /** Removes a computer from the account and drops it from the relay now. */
    public function revoke(User $user, string $hostId): bool
    {
        $removed = DB::transaction(function () use ($user, $hostId) {
            $host = RemoteHost::query()->where('user_id', $user->id)->where('host_id', $hostId)->lockForUpdate()->first();
            if ($host === null || $host->revoked_at !== null) return false;
            $host->forceFill(['revoked_at' => now(), 'online_until' => null,
                'authorization_generation' => $host->authorization_generation + 1])->save();
            $host->sessions()->whereNull('ended_at')->update(['ended_at' => now(), 'revoked_at' => now(), 'status' => 'REVOKED']);
            app(RemoteVerificationInvalidation::class)->host($host->id);
            $this->presence->audit($host, 'host.removed');
            app(RemoteRevocations::class)->queue($hostId, $host->authorization_generation);
            return true;
        });
        // Attempt delivery after commit. Failure cannot roll back revocation.
        app(RemoteRevocations::class)->deliver($hostId);
        return $removed;
    }

    public function describe(RemoteHost $host): array
    {
        return ['id' => $host->host_id, 'name' => $host->name, 'platform' => $host->platform, 'version' => $host->app_version,
            'online' => $host->isOnline(), 'lastSeenAt' => $host->last_seen_at?->toIso8601String(),
            'activeSessions' => (int) ($host->active_sessions ?? 0), 'securityVersion' => 1, 'remoteAccessMode' => $host->remote_access_mode];
    }
}
