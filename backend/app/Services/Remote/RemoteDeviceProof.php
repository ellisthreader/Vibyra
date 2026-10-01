<?php

namespace App\Services\Remote;

use App\Models\{TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Existing Noise X25519 keys answer a single-use libsodium sealed challenge. */
class RemoteDeviceProof
{
    public function challenge(VibyraSession $session, string $uuid, string $purpose, array $permissions = []): array
    {
        if (! in_array($purpose, ['connect', 'passkey'], true)) throw new RemoteAccessException('Invalid device verification purpose.', 422);
        return DB::transaction(function () use ($session, $uuid, $purpose, $permissions) {
            $device = $this->owned($session, $uuid);
            if (! $device->trusted() && ! $this->pendingCloudPasskey($device, $purpose)) throw new RemoteAccessException('This device has not been approved for remote access.', 403, 'device_not_trusted');
            $this->permissions($device, $permissions);
            return $this->issue($session, $device, $purpose, $device->public_key, $permissions);
        });
    }

    public function consume(VibyraSession $session, string $uuid, string $purpose, string $id, string $proof, array $permissions = []): TrustedDevice
    {
        return DB::transaction(function () use ($session, $uuid, $purpose, $id, $proof, $permissions) {
            $device = $this->owned($session, $uuid);
            if (! $device->trusted() && ! $this->pendingCloudPasskey($device, $purpose)) throw new RemoteAccessException('This device has not been approved for remote access.', 403, 'device_not_trusted');
            $this->permissions($device, $permissions);
            $this->consumeFor($session, $device, $purpose, $id, $proof, $permissions);
            $device->forceFill(['last_seen_at' => now()])->save();
            return $device;
        });
    }

    public function issue(VibyraSession $session, TrustedDevice $device, string $purpose, string $publicKey, array $permissions = []): array
    {
        $permissions = RemotePermissions::normalize($permissions);
        if (DB::table('remote_device_challenges')->where('app_session_id', $session->id)
            ->whereNull('consumed_at')->where('expires_at', '>', now())->count() >= 5) {
            throw new RemoteAccessException('Wait two minutes before requesting another verification.', 429);
        }
        $proof = random_bytes(32);
        try { $ciphertext = sodium_crypto_box_seal($proof, hex2bin($publicKey)); }
        catch (\SodiumException) { throw new RemoteAccessException('Invalid device identity.', 422); }
        $id = (string) Str::uuid();
        DB::table('remote_device_challenges')->insert(['id' => $id, 'trusted_device_id' => $device->id,
            'user_id' => $session->user_id, 'app_session_id' => $session->id, 'authorization_generation' => $device->authorization_generation,
            'purpose' => $purpose, 'proof_hash' => hash('sha256', $proof), 'permissions' => json_encode($permissions, JSON_THROW_ON_ERROR),
            'expires_at' => now()->addSeconds(120)]);
        return ['challengeId' => $id, 'ciphertext' => base64_encode($ciphertext), 'expiresIn' => 120,
            'deviceId' => $device->uuid, 'hostId' => $device->host->host_id, 'purpose' => $purpose, 'permissions' => $permissions,
            'pairingCode' => $device->pairing_code, 'publicKey' => $device->public_key];
    }

    /** Caller holds target device/host locks and verifies its current state. */
    public function consumeFor(VibyraSession $session, TrustedDevice $device, string $purpose, string $id, string $proof, array $permissions = []): void
    {
        $challenge = Str::isUuid($id) ? DB::table('remote_device_challenges')->where('id', $id)->lockForUpdate()->first() : null;
        $bytes = base64_decode($proof, true);
        if (! $challenge || $challenge->consumed_at !== null || now()->gte($challenge->expires_at)
            || (int) $challenge->user_id !== (int) $session->user_id || (int) $challenge->app_session_id !== $session->id
            || (int) $challenge->trusted_device_id !== $device->id || (int) $challenge->authorization_generation !== $device->authorization_generation
            || $challenge->purpose !== $purpose || json_decode($challenge->permissions, true) !== RemotePermissions::normalize($permissions)
            || $bytes === false || strlen($bytes) !== 32 || ! hash_equals($challenge->proof_hash, hash('sha256', $bytes))) {
            throw new RemoteAccessException('Device verification expired or was already used. Try again.', 403, 'device_proof_invalid');
        }
        if (DB::table('remote_device_challenges')->where('id', $id)->whereNull('consumed_at')->update(['consumed_at' => now()]) !== 1) {
            throw new RemoteAccessException('Device verification was already used.', 403, 'device_proof_invalid');
        }
    }

    public function owned(VibyraSession $session, string $uuid): TrustedDevice
    {
        if (! Str::isUuid($uuid)) throw new RemoteAccessException('That device is not available.', 404);
        // Lock the host before its devices, matching registration/revocation order.
        $device = TrustedDevice::query()->where('user_id', $session->user_id)->where('uuid', $uuid)->first();
        if (! $device) throw new RemoteAccessException('That device is not available.', 404);
        $host = \App\Models\RemoteHost::query()->whereKey($device->remote_host_id)->where('user_id', $session->user_id)
            ->whereNull('revoked_at')->lockForUpdate()->first();
        if (! $host) throw new RemoteAccessException('That computer is not available.', 404);
        $device = TrustedDevice::whereKey($device->id)->where('uuid', $uuid)->where('user_id', $session->user_id)->lockForUpdate()->first();
        if (! $device) throw new RemoteAccessException('That device request is no longer available.', 404);
        $device->setRelation('host', $host);
        return $device;
    }

    /** A pending phone of a cloud computer may prove key possession only to start its approving passkey ceremony. */
    private function pendingCloudPasskey(TrustedDevice $device, string $purpose): bool
    {
        return $purpose === 'passkey' && app(\App\Services\CloudComputer\HostAuthority::class)->passkeyApprovable($device, $device->host);
    }

    private function permissions(TrustedDevice $device, array $permissions): void
    {
        if (array_diff(RemotePermissions::normalize($permissions), $device->permissions ?? [])) {
            throw new RemoteAccessException('Approve these permissions on your computer before connecting.', 403, 'remote_permission_denied');
        }
    }
}
