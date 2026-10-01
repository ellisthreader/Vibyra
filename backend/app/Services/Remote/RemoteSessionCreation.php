<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, User, VibyraSession};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RemoteSessionCreation
{
    public function create(User $user, string $hostId, ?string $name, ?int $sessionId, array $request): array
    {
        return DB::transaction(function () use ($user, $hostId, $name, $sessionId, $request) {
            $host = RemoteHost::where('user_id', $user->id)->where('host_id', $hostId)->whereNull('revoked_at')->lockForUpdate()->first();
            if (! $host) throw new RemoteAccessException('That computer is not on this account. Turn on remote access in Vibyra on it.', 404);
            if (! $host->isOnline()) {
                $cloud = app(\App\Services\CloudComputer\Computers::class)->forHost($host->id);
                if ($cloud && in_array($cloud->state, ['stopped', 'archived', 'expired'], true)) throw new RemoteAccessException('Your cloud computer is asleep.', 409, 'host_asleep', ['wake' => true]);
                if ($cloud) throw new RemoteAccessException('Your cloud computer is starting.', 409, 'host_starting', ['wake' => false]);
                throw new RemoteAccessException('That computer is not online. Open Vibyra on it and keep it awake.', 409);
            }
            $app = $this->appSession($user, $sessionId);
            $device = app(RequireRemoteAccessAuthorization::class)->verify($app, $host, $request);
            RemoteSession::where('user_id', $user->id)->where('status', 'WAITING_FOR_APPROVAL')->whereNull('ended_at')
                ->where('issued_at', '<=', now()->subMinutes(5))->update(['status' => 'EXPIRED', 'ended_at' => now()]);
            if (RemoteSession::where('user_id', $user->id)->whereNull('ended_at')->where('expires_at', '>', now())->count() >= 32) {
                throw new RemoteAccessException('Disconnect an unused remote session before opening another.', 429);
            }
            $status = $host->remote_access_mode === 'trusted' ? 'AUTHORIZED' : 'WAITING_FOR_APPROVAL';
            $session = RemoteSession::create(['user_id' => $user->id, 'remote_host_id' => $host->id,
                'grant_id' => Str::lower(Str::random(32)), 'authorization_generation' => $host->authorization_generation,
                'client_name' => $name !== null ? mb_substr($name, 0, 80) : $device->device_name,
                'app_session_id' => $app->id, 'trusted_device_id' => $device->id, 'status' => $status,
                'permissions' => RemotePermissions::normalize($request['permissions'] ?? []), 'issued_at' => now(),
                'authorized_at' => $status === 'AUTHORIZED' ? now() : null,
                'expires_at' => now()->addSeconds(max(60, min(43200, (int) config('remote.session_max_seconds', 28800))))]);
            app(RemotePresence::class)->audit($host, 'session.requested', ['client' => $device->device_name, 'permissions' => $session->permissions], $device->id, $session->id);
            return app(RemoteSessionGrants::class)->payload($session);
        });
    }

    public function token(User $user, int $sessionId, string $id, array $request): array
    {
        return DB::transaction(function () use ($user, $sessionId, $id, $request) {
            $remote = RemoteSession::where('user_id', $user->id)->where('grant_id', $id)->first();
            if (! $remote) throw new RemoteAccessException('That remote session is not available.', 404);
            $host = RemoteHost::whereKey($remote->remote_host_id)->where('user_id', $user->id)->whereNull('revoked_at')->lockForUpdate()->first();
            $remote = RemoteSession::whereKey($remote->id)->lockForUpdate()->firstOrFail();
            if (! $host || ! $host->isOnline() || $remote->status !== 'AUTHORIZED' || $remote->ended_at || $remote->admitted_at
                || $remote->expires_at->lte(now()) || $remote->app_session_id !== $sessionId
                || ! $remote->authorized_at || $remote->authorized_at->lte(now()->subMinutes(5))
                || $remote->authorization_generation !== $host->authorization_generation) {
                throw new RemoteAccessException('That remote session is not ready to connect.', 409);
            }
            $app = $this->appSession($user, $sessionId);
            $device = app(RequireRemoteAccessAuthorization::class)->verify($app, $host, $request);
            if ($device->id !== $remote->trusted_device_id || RemotePermissions::normalize($request['permissions'] ?? []) !== $remote->permissions) {
                throw new RemoteAccessException('The device or permissions changed. Request a new connection.', 403);
            }
            return app(RemoteSessionGrants::class)->payload($remote);
        });
    }

    private function appSession(User $user, ?int $id): VibyraSession
    {
        $session = VibyraSession::whereKey($id)->where('user_id', $user->id)->whereNull('revoked_at')->first();
        if (! $session || ! $session->idle_expires_at || ! $session->absolute_expires_at
            || $session->idle_expires_at->lte(now()) || $session->absolute_expires_at->lte(now())) {
            throw new RemoteAccessException('Sign in again before connecting.', 401);
        }
        return $session;
    }
}
