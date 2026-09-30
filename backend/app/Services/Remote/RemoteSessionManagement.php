<?php

namespace App\Services\Remote;

use App\Models\{RemoteSession, User};
use Illuminate\Support\Facades\DB;

class RemoteSessionManagement
{
    public function sessions(User $user): array
    {
        return RemoteSession::query()->where('user_id', $user->id)->with('host')
            ->orderByDesc('id')->limit(100)->get()->map(fn ($session) => $this->describe($session))->all();
    }

    public function find(User $user, string $id): array
    {
        return $this->describe($this->owned($user, $id));
    }

    public function revoke(User $user, string $id): array
    {
        $session = DB::transaction(function () use ($user, $id) {
            $session = $this->owned($user, $id, true);
            if (! $session->ended_at) {
                $session->forceFill(['status' => 'REVOKED', 'revoked_at' => now(), 'ended_at' => now()])->save();
                app(RemotePresence::class)->audit($session->host, 'session.revoked', ['client' => $session->client_name], $session->trusted_device_id, $session->id);
                app(RemoteSessionRevocations::class)->queue($session);
            }
            return $session;
        });
        app(RemoteSessionRevocations::class)->deliver($session->id);
        return ['session' => $this->describe($session), 'disconnectPending' => app(RemoteSessionRevocations::class)->pending($session->id)];
    }

    private function owned(User $user, string $id, bool $lock = false): RemoteSession
    {
        $query = RemoteSession::query()->where('user_id', $user->id)->where('grant_id', $id)->with('host');
        $session = ($lock ? $query->lockForUpdate() : $query)->first();
        if (! $session) throw new RemoteAccessException('That remote session is not available.', 404);
        return $session;
    }

    private function describe(RemoteSession $session): array
    {
        $expired = ! $session->ended_at && ($session->expires_at?->lessThanOrEqualTo(now())
            || ($session->status === 'WAITING_FOR_APPROVAL' && $session->issued_at?->lte(now()->subMinutes(5)))
            || ($session->status === 'AUTHORIZED' && $session->authorized_at?->lte(now()->subMinutes(5))));
        return ['id' => $session->grant_id, 'hostId' => $session->host?->host_id,
            'clientName' => $session->client_name, 'status' => $expired ? 'EXPIRED' : $session->status, 'permissions' => $session->permissions,
            'issuedAt' => $session->issued_at?->toIso8601String(), 'connectedAt' => $session->started_at?->toIso8601String(),
            'expiresAt' => $session->expires_at?->toIso8601String(), 'endedAt' => $session->ended_at?->toIso8601String()];
    }
}
