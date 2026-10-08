<?php

namespace App\Services\Remote;

use App\Models\RemoteHost;
use App\Models\RemoteSession;
use App\Models\User;
use App\Services\Vibes\Plans;
use Illuminate\Support\Str;

/**
 * The account's computers and the grants that let a phone reach one. Every
 * decision here is one the relay then trusts blindly, so it is the whole
 * authorisation: the computer belongs to this account, the account may connect
 * from anywhere, and the grant is short-lived.
 */
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
        $entitled = ! config('remote.require_plan') || (bool) $this->plans->for($user->plan ?: 'free')['remoteAccess'];

        return ['live' => $live, 'entitled' => $entitled];
    }

    /** A computer signing in: upserts its row and hands it a registration token. */
    public function register(User $user, string $hostId, string $name, ?string $platform, ?string $version): array
    {
        $host = RemoteHost::query()->where('host_id', $hostId)->first();
        if ($host !== null && $host->user_id !== $user->id) {
            // A computer identity belongs to whichever account last signed in on that
            // computer; the previous owner's grants stop matching at the relay at once.
            $host->sessions()->whereNull('ended_at')->update(['ended_at' => now()]);
        }
        $owned = RemoteHost::query()->where('user_id', $user->id)->whereNull('revoked_at')->where('host_id', '!=', $hostId)->count();
        if ($owned >= (int) config('remote.max_hosts_per_user')) {
            throw new RemoteAccessException('This account already has as many computers as it can hold. Remove one first.', 409);
        }
        $host = RemoteHost::query()->updateOrCreate(['host_id' => $hostId], [
            'user_id' => $user->id, 'name' => $name, 'platform' => $platform, 'app_version' => $version,
            'registered_at' => now(), 'revoked_at' => null,
        ]);
        $this->presence->audit($host, 'host.registered');
        $ttl = (int) config('remote.host_token_seconds');

        return ['host' => $this->describe($host), 'relayUrl' => $this->gateway->publicUrl(), 'expiresIn' => $ttl,
            'token' => $this->tokens->mint(['role' => 'host', 'hostId' => $hostId, 'userId' => (string) $user->id], $ttl)];
    }

    /** @return list<array<string,mixed>> */
    public function computers(User $user): array
    {
        return RemoteHost::query()->where('user_id', $user->id)->whereNull('revoked_at')
            ->withCount(['sessions as active_sessions' => fn ($query) => $query->whereNotNull('started_at')->whereNull('ended_at')])
            ->orderByDesc('online_until')->orderBy('name')->get()->map(fn (RemoteHost $host) => $this->describe($host))->all();
    }

    /** A phone asking to reach one of the account's computers: a fresh grant, or the reason there is none. */
    public function connect(User $user, string $hostId, ?string $clientName): array
    {
        $availability = $this->availability($user);
        if (! $availability['live']) {
            throw new RemoteAccessException('Remote access is not available yet.', 503);
        }
        if (! $availability['entitled']) {
            throw new RemoteAccessException('Connecting from anywhere is part of Pro. Your computer still works on the same Wi-Fi.', 403);
        }
        $host = RemoteHost::query()->where('user_id', $user->id)->where('host_id', $hostId)->whereNull('revoked_at')->first();
        if ($host === null) {
            throw new RemoteAccessException('That computer is not on this account. Turn on remote access in Vibyra on it.', 404);
        }
        if (! $host->isOnline()) {
            throw new RemoteAccessException('That computer is not online. Open Vibyra on it and keep it awake.', 409);
        }
        $grant = Str::lower(Str::random(32));
        $ttl = (int) config('remote.client_token_seconds');
        RemoteSession::create(['user_id' => $user->id, 'remote_host_id' => $host->id, 'grant_id' => $grant,
            'client_name' => $clientName !== null ? mb_substr($clientName, 0, 80) : null, 'issued_at' => now()]);

        return ['host' => $this->describe($host), 'relayUrl' => $this->gateway->publicUrl(), 'expiresIn' => $ttl,
            'token' => $this->tokens->mint(['role' => 'client', 'hostId' => $hostId, 'userId' => (string) $user->id, 'jti' => $grant], $ttl)];
    }

    /** Removes a computer from the account and drops it from the relay now. */
    public function revoke(User $user, string $hostId): bool
    {
        $host = RemoteHost::query()->where('user_id', $user->id)->where('host_id', $hostId)->whereNull('revoked_at')->first();
        if ($host === null) {
            return false;
        }
        $host->forceFill(['revoked_at' => now(), 'online_until' => null])->save();
        $host->sessions()->whereNull('ended_at')->update(['ended_at' => now()]);
        $this->presence->audit($host, 'host.removed');
        $this->gateway->disconnect($hostId);

        return true;
    }

    private function describe(RemoteHost $host): array
    {
        return ['id' => $host->host_id, 'name' => $host->name, 'platform' => $host->platform, 'version' => $host->app_version,
            'online' => $host->isOnline(), 'lastSeenAt' => $host->last_seen_at?->toIso8601String(),
            'activeSessions' => (int) ($host->active_sessions ?? 0)];
    }
}
