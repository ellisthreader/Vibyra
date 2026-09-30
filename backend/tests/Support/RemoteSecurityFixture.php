<?php

namespace Tests\Support;

use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Remote\RemoteDeviceProof;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Authorization fixtures; real WebAuthn verification has its own signed tests. */
trait RemoteSecurityFixture
{
    private array $remoteFixtureKeys = [];
    private function secureRemoteRequest(User $user, VibyraSession $session, RemoteHost $host, array $permissions = ['preview:access'], bool $trustedMode = true): array
    {
        if ($trustedMode) $host->forceFill(['remote_access_mode' => 'trusted'])->save();
        $keys = sodium_crypto_box_keypair();
        $device = TrustedDevice::create(['uuid' => (string) Str::uuid(), 'user_id' => $user->id, 'remote_host_id' => $host->id,
            'authorization_generation' => $host->authorization_generation, 'public_key' => bin2hex(sodium_crypto_box_publickey($keys)),
            'device_name' => 'Fixture phone', 'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(10),
            'approved_at' => now(), 'permissions' => $permissions]);
        $this->strongRemoteFixture($session, $device);
        $this->remoteFixtureKeys[$device->uuid] = $keys;
        return $this->remoteProofRequest($session, $device, $keys, $permissions);
    }

    private function freshRemoteProof(VibyraSession $session, string $uuid, array $permissions = ['preview:access']): array
    {
        return $this->remoteProofRequest($session, TrustedDevice::where('uuid', $uuid)->firstOrFail(), $this->remoteFixtureKeys[$uuid], $permissions);
    }

    private function strongRemoteFixture(VibyraSession $session, TrustedDevice $device): void
    {
        $credential = (string) Str::uuid();
        $id = DB::table('passkey_credentials')->insertGetId(['user_id' => $session->user_id,
            'credential_hash' => hash('sha256', $credential), 'credential_id' => $credential,
            'public_key' => 'fixture-only', 'counter' => 1, 'device_name' => 'Fixture phone', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('remote_strong_auth')->updateOrInsert(['app_session_id' => $session->id, 'trusted_device_id' => $device->id],
            ['passkey_credential_id' => $id, 'verified_at' => now(), 'expires_at' => now()->addMinutes(5)]);
    }

    private function remoteProofRequest(VibyraSession $session, TrustedDevice $device, string $keys, array $permissions): array
    {
        $challenge = app(RemoteDeviceProof::class)->challenge($session, $device->uuid, 'connect', $permissions);
        return ['deviceId' => $device->uuid, 'challengeId' => $challenge['challengeId'], 'permissions' => $permissions,
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))];
    }
}
