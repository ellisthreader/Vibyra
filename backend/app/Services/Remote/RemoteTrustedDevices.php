<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RemoteTrustedDevices
{
    public function register(VibyraSession $session, array $data, ?string $ip): TrustedDevice
    {
        $permissions = RemotePermissions::normalize($data['permissions'] ?? []);
        try { sodium_crypto_box_seal(random_bytes(32), hex2bin($data['publicKey'])); }
        catch (\SodiumException) { throw new RemoteAccessException('Invalid device identity.', 422); }
        $data['permissions'] = $permissions;
        return DB::transaction(function () use ($session, $data, $ip) {
            $host = $this->host($session, $data['hostId']);
            $device = TrustedDevice::where('user_id', $session->user_id)->where('remote_host_id', $host->id)
                ->where('public_key', $data['publicKey'])->lockForUpdate()->first();
            if ($device && $device->authorization_generation === $host->authorization_generation
                && ($device->trusted() || (! $device->revoked_at && ! $device->denied_at && $device->request_expires_at->isFuture()))) return $device;
            if (TrustedDevice::where('user_id', $session->user_id)->whereNull('revoked_at')->count() >= 64) {
                throw new RemoteAccessException('Revoke an unused remote device before adding another.', 409);
            }
            $device ??= new TrustedDevice(['uuid' => (string) Str::uuid(), 'user_id' => $session->user_id,
                'remote_host_id' => $host->id, 'public_key' => $data['publicKey']]);
            $device->forceFill(['uuid' => (string) Str::uuid(), 'authorization_generation' => $host->authorization_generation,
                'approved_revision' => 0,
                'device_name' => trim($data['deviceName']), 'platform' => $data['platform'] ?? null, 'last_ip' => $ip, 'permissions' => $data['permissions'],
                'pairing_code' => sprintf('%06d', random_int(0, 999999)), 'request_expires_at' => now()->addMinutes(10),
                'approved_at' => null, 'denied_at' => null, 'revoked_at' => null])->save();
            $device->setRelation('host', $host);
            DB::table('remote_device_challenges')->where('trusted_device_id', $device->id)->delete();
            DB::table('remote_strong_auth')->where('trusted_device_id', $device->id)->delete();
            DB::table('remote_passkey_ceremonies')->where('trusted_device_id', $device->id)->update(['consumed_at' => now(), 'invalidated_at' => now()]);
            app(RemotePresence::class)->audit($host, 'device.pairing_requested', ['device' => $device->device_name], $device->id);
            return $device;
        });
    }

    public function pending(VibyraSession $session, string $hostId): array
    {
        $host = $this->host($session, $hostId);
        return TrustedDevice::where('user_id', $session->user_id)->where('remote_host_id', $host->id)
            ->where('authorization_generation', $host->authorization_generation)->whereNull('approved_at')
            ->whereNull('denied_at')->whereNull('revoked_at')->where('request_expires_at', '>', now())
            ->limit(64)->get()->map(fn ($device) => $this->describe($device))->all();
    }

    public function decisionChallenge(VibyraSession $session, string $hostId, string $uuid, string $decision): array
    {
        if (! in_array($decision, ['approve', 'deny'], true)) throw new RemoteAccessException('Invalid device decision.', 422);
        return DB::transaction(function () use ($session, $hostId, $uuid, $decision) {
            $device = $this->pendingDevice($session, $hostId, $uuid);
            return app(RemoteDeviceProof::class)->issue($session, $device, $decision, $hostId, $device->permissions);
        });
    }

    public function decide(VibyraSession $session, string $hostId, string $uuid, string $decision, string $challenge, string $proof): TrustedDevice
    {
        if (! in_array($decision, ['approve', 'deny'], true)) throw new RemoteAccessException('Invalid device decision.', 422);
        return DB::transaction(function () use ($session, $hostId, $uuid, $decision, $challenge, $proof) {
            $device = $this->pendingDevice($session, $hostId, $uuid);
            app(RemoteDeviceProof::class)->consumeFor($session, $device, $decision, $challenge, $proof, $device->permissions);
            $revision = app(RemoteRestrictions::class)->advance($device->host);
            $device->forceFill($decision === 'approve'
                ? ['approved_at' => now(), 'approved_revision' => $revision, 'revocation_revision' => 0]
                : ['denied_at' => now(), 'revoked_at' => now(), 'revocation_revision' => $revision])->save();
            app(RemotePresence::class)->audit($device->host, $decision === 'approve' ? 'device.approved' : 'device.denied', ['device' => $device->device_name], $device->id);
            return $device;
        });
    }

    public function revoke(VibyraSession $session, string $uuid): TrustedDevice
    {
        $device = DB::transaction(function () use ($session, $uuid) {
            $device = TrustedDevice::where('user_id', $session->user_id)->where('uuid', $uuid)->first();
            if (! $device) throw new RemoteAccessException('That device is not available.', 404);
            $host = RemoteHost::whereKey($device->remote_host_id)->where('user_id', $session->user_id)->lockForUpdate()->first();
            if (! $host) throw new RemoteAccessException('That computer is not available.', 404);
            $device = TrustedDevice::whereKey($device->id)->where('uuid', $uuid)->where('user_id', $session->user_id)->lockForUpdate()->first();
            if (! $device) throw new RemoteAccessException('That device request is no longer available.', 404);
            $device->setRelation('host', $host);
            if ($device->revoked_at && $device->revocation_revision > 0) return $device;
            $this->revokeLocked($device);
            return $device;
        });
        app(RemoteSessionRevocations::class)->deliver();
        return $device;
    }

    public function revokeAll(VibyraSession $session): int
    {
        $count = DB::transaction(function () use ($session) {
            \App\Models\User::whereKey($session->user_id)->lockForUpdate()->firstOrFail();
            $hosts = RemoteHost::where('user_id', $session->user_id)->orderBy('id')->lockForUpdate()->get();
            $count = 0;
            foreach ($hosts as $host) {
                app(RemoteRestrictions::class)->reset($host);
                $devices = TrustedDevice::where('remote_host_id', $host->id)->where('user_id', $session->user_id)->whereNull('revoked_at')->lockForUpdate()->get();
                foreach ($devices as $device) {
                    $device->setRelation('host', $host);
                    $this->revokeLocked($device, false); $count++;
                }
            }
            app(SecurityEvents::class)->record($session->user_id, 'DEVICE_REVOKED', ['count' => $count, 'reason' => 'all_devices']);
            return $count;
        });
        app(RemoteSessionRevocations::class)->deliver();
        return $count;
    }

    private function revokeLocked(TrustedDevice $device, bool $audit = true): void
    {
        $revision = app(RemoteRestrictions::class)->advance($device->host);
        $device->forceFill(['revoked_at' => now(), 'revocation_revision' => $revision])->save();
        DB::table('remote_device_challenges')->where('trusted_device_id', $device->id)->delete();
        DB::table('remote_strong_auth')->where('trusted_device_id', $device->id)->delete();
        DB::table('remote_passkey_ceremonies')->where('trusted_device_id', $device->id)->update(['consumed_at' => now(), 'invalidated_at' => now()]);
        $sessions = RemoteSession::where('user_id', $device->user_id)->where('trusted_device_id', $device->id)->whereNull('ended_at')->lockForUpdate()->get();
        foreach ($sessions as $remote) {
            $remote->forceFill(['status' => 'REVOKED', 'revoked_at' => now(), 'ended_at' => now()])->save();
            app(RemoteSessionRevocations::class)->queue($remote);
        }
        if ($audit && $device->host && (string) $device->host->user_id === (string) $device->user_id) {
            app(RemotePresence::class)->audit($device->host, 'device.revoked', ['device' => $device->device_name], $device->id);
        }
    }

    public function describe(TrustedDevice $device): array
    {
        return ['id' => $device->uuid, 'hostId' => $device->host?->host_id, 'publicKey' => $device->public_key,
            'securityRevision' => (int) $device->host?->security_revision, 'approvedRevision' => (int) $device->approved_revision,
            'deviceName' => $device->device_name, 'platform' => $device->platform, 'lastIp' => $device->last_ip, 'permissions' => $device->permissions,
            'pairingCode' => $device->pairing_code, 'requestExpiresAt' => $device->request_expires_at?->toIso8601String(),
            'approvedAt' => $device->trusted() ? $device->approved_at?->toIso8601String() : null,
            'deniedAt' => $device->denied_at?->toIso8601String(), 'revokedAt' => $device->revoked_at?->toIso8601String(),
            'lastSeenAt' => $device->last_seen_at?->toIso8601String()];
    }

    private function pendingDevice(VibyraSession $session, string $hostId, string $uuid): TrustedDevice
    {
        $device = app(RemoteDeviceProof::class)->owned($session, $uuid);
        if ($device->host->host_id !== $hostId || $device->authorization_generation !== $device->host->authorization_generation
            || $device->approved_at || $device->denied_at || $device->revoked_at || $device->request_expires_at->lessThanOrEqualTo(now())) {
            throw new RemoteAccessException('That device request expired or was already decided.', 409);
        }
        return $device;
    }

    private function host(VibyraSession $session, string $id): RemoteHost
    {
        $host = RemoteHost::where('host_id', $id)->where('user_id', $session->user_id)->whereNull('revoked_at')->lockForUpdate()->first();
        if (! $host) throw new RemoteAccessException('That computer is not available.', 404);
        return $host;
    }
}
