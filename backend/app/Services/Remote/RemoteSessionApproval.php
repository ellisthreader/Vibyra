<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, VibyraSession};
use Illuminate\Support\Facades\DB;

class RemoteSessionApproval
{
    public function pending(VibyraSession $app, string $hostId): array
    {
        $host = app(RemoteHostPolicy::class)->host($app, $hostId);
        return RemoteSession::where('remote_host_id', $host->id)->where('user_id', $app->user_id)
            ->where('status', 'WAITING_FOR_APPROVAL')->whereNull('ended_at')->where('issued_at', '>', now()->subMinutes(5))
            ->where('authorization_generation', $host->authorization_generation)->with('trustedDevice')->limit(32)->get()
            ->map(fn ($session) => ['id' => $session->grant_id, 'deviceId' => $session->trustedDevice?->uuid,
                'publicKey' => $session->trustedDevice?->public_key, 'clientName' => $session->client_name,
                'permissions' => $session->permissions, 'requestedAt' => $session->issued_at->toIso8601String()])->all();
    }

    public function challenge(VibyraSession $app, string $hostId, string $id, string $decision): array
    {
        return DB::transaction(function () use ($app, $hostId, $id, $decision) {
            [$host, $session] = $this->waiting($app, $hostId, $id);
            return app(RemoteHostSecurityProof::class)->issue($app, $host, 'session', $id, $this->parameters($session, $decision));
        });
    }

    public function decide(VibyraSession $app, string $hostId, string $id, string $decision, string $challenge, string $proof): array
    {
        return DB::transaction(function () use ($app, $hostId, $id, $decision, $challenge, $proof) {
            [$host, $session] = $this->waiting($app, $hostId, $id);
            app(RemoteHostSecurityProof::class)->consume($app, $host, 'session', $id, $this->parameters($session, $decision), $challenge, $proof);
            $session->forceFill($decision === 'allow' ? ['status' => 'AUTHORIZED', 'authorized_at' => now()]
                : ['status' => 'DENIED', 'ended_at' => now()])->save();
            app(RemotePresence::class)->audit($host, $decision === 'allow' ? 'session.authorized' : 'session.denied',
                ['client' => $session->client_name, 'permissions' => $session->permissions], $session->trusted_device_id, $session->id);
            return ['sessionId' => $session->grant_id, 'status' => $session->status];
        });
    }

    private function waiting(VibyraSession $app, string $hostId, string $id): array
    {
        $host = app(RemoteHostPolicy::class)->host($app, $hostId);
        $session = RemoteSession::where('user_id', $app->user_id)->where('remote_host_id', $host->id)->where('grant_id', $id)->lockForUpdate()->first();
        if (! $session) throw new RemoteAccessException('That remote session is not available.', 404);
        if ($host->remote_access_mode === 'disabled' || $session->status !== 'WAITING_FOR_APPROVAL' || $session->ended_at
            || $session->issued_at->lte(now()->subMinutes(5)) || $session->authorization_generation !== $host->authorization_generation
            || ! $session->trustedDevice?->trusted()) {
            throw new RemoteAccessException('That connection request expired or was already decided.', 409);
        }
        return [$host, $session];
    }

    private function parameters(RemoteSession $session, string $decision): array
    {
        if (! in_array($decision, ['allow', 'deny'], true)) throw new RemoteAccessException('Choose whether to allow this session.', 422);
        return ['decision' => $decision, 'permissions' => $session->permissions, 'deviceId' => $session->trustedDevice->public_key];
    }
}
