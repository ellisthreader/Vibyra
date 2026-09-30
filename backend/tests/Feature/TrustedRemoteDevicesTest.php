<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, RemoteSession, TrustedDevice, User, VibyraSession};
use App\Services\Remote\{RemoteAccessException, RemoteDeviceProof, RemoteTrustedDevices};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TrustedRemoteDevicesTest extends TestCase
{
    use RefreshDatabase;
    private function fixture(): array
    {
        $user = User::factory()->create(); $token = 'session-'.$user->id;
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'phone',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $keys = sodium_crypto_box_keypair(); $phone = sodium_crypto_box_keypair();
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(sodium_crypto_box_publickey($keys)),
            'name' => 'Home Mac', 'registered_at' => now(), 'authorization_generation' => 1]);
        $headers = ['Authorization' => 'Bearer '.$token];
        $body = ['hostId' => $host->host_id, 'publicKey' => bin2hex(sodium_crypto_box_publickey($phone)),
            'deviceName' => 'Phone', 'platform' => 'ios', 'permissions' => ['preview:access']];
        $device = $this->postJson('/api/security/devices/register', $body, $headers)->assertOk()->json('device');
        return [$session, $host, $keys, $phone, $headers, $device, $body];
    }

    private function approve(array $fixture): array
    {
        [$session, $host, $keys, , $headers, $device] = $fixture;
        $path = '/api/remote/hosts/'.$host->host_id.'/devices/'.$device['id'];
        $challenge = $this->postJson($path.'/challenge', ['decision' => 'approve'], $headers)->assertOk()->json();
        $data = ['decision' => 'approve', 'challengeId' => $challenge['challengeId'],
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))];
        $this->postJson($path.'/decision', $data, $headers)->assertOk();
        return [$path, $data];
    }

    private function rejected(callable $action, int $status = 403): void
    {
        try { $action(); $this->fail('Unsafe operation accepted'); }
        catch (RemoteAccessException $error) { $this->assertSame($status, $error->status); }
    }

    public function test_unknown_device_needs_target_computer_proof_and_pairing_code_grants_nothing(): void
    {
        $fixture = $this->fixture(); [$session, $host, , , $headers, $device] = $fixture;
        $this->assertNull($device['approvedAt']);
        $this->assertMatchesRegularExpression('/^\d{6}$/', $device['pairingCode']);
        $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'connect'], $headers)->assertForbidden();
        $base = '/api/remote/hosts/'.$host->host_id.'/devices/'.$device['id'];
        $this->postJson($base.'/decision', ['decision' => 'approve', 'pairingCode' => $device['pairingCode']], $headers)->assertUnprocessable();
        $this->getJson('/api/remote/hosts/'.$host->host_id.'/devices/pending', $headers)->assertOk()->assertJsonCount(1, 'devices');
        [$path, $data] = $this->approve($fixture);
        $this->postJson($path.'/decision', $data, $headers)->assertStatus(409);
        $this->getJson('/api/security/devices/'.$device['id'], $headers)->assertOk()->assertJsonPath('device.permissions', ['preview:access']);
        $this->assertTrue(TrustedDevice::first()->trusted());
    }

    public function test_client_proof_binds_session_purpose_permissions_and_is_single_use(): void
    {
        $fixture = $this->fixture(); [$session, , , $phone, , $device] = $fixture; $this->approve($fixture);
        $service = app(RemoteDeviceProof::class);
        $challenge = $service->challenge($session, $device['id'], 'connect', ['preview:access']);
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $phone));
        $other = $session->replicate(); $other->token_hash = hash('sha256', 'different'); $other->save();
        $this->rejected(fn () => $service->consume($other, $device['id'], 'connect', $challenge['challengeId'], $proof, ['preview:access']));
        $this->rejected(fn () => $service->consume($session, $device['id'], 'passkey', $challenge['challengeId'], $proof));
        $this->rejected(fn () => $service->consume($session, $device['id'], 'connect', $challenge['challengeId'], $proof, ['terminal:access']));
        $result = $service->consume($session, $device['id'], 'connect', $challenge['challengeId'], $proof, ['preview:access']);
        $this->assertSame($device['id'], $result->uuid);
        $this->rejected(fn () => $service->consume($session, $device['id'], 'connect', $challenge['challengeId'], $proof, ['preview:access']));
    }

    public function test_another_account_or_computer_cannot_approve_or_revoke_the_device(): void
    {
        $a = $this->fixture(); $b = $this->fixture();
        [, $host, , , $headers, $device] = $a; [, $foreignHost, , , $foreign] = $b;
        $this->getJson('/api/security/devices/'.$device['id'], $foreign)->assertNotFound();
        $this->deleteJson('/api/security/devices/'.$device['id'], [], $foreign)->assertNotFound();
        $this->postJson('/api/remote/hosts/'.$host->host_id.'/devices/'.$device['id'].'/challenge', ['decision' => 'approve'], $foreign)->assertNotFound();
        $this->postJson('/api/remote/hosts/'.$foreignHost->host_id.'/devices/'.$device['id'].'/challenge', ['decision' => 'approve'], $headers)->assertStatus(409);
        $this->assertNull(TrustedDevice::where('uuid', $device['id'])->first()->approved_at);
    }

    public function test_host_decision_is_bound_to_exact_device_and_decision(): void
    {
        [$session, $host, $keys, , , $device] = $this->fixture();
        $service = app(RemoteTrustedDevices::class);
        $challenge = $service->decisionChallenge($session, $host->host_id, $device['id'], 'deny');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
        $this->rejected(fn () => $service->decide($session, $host->host_id, $device['id'], 'approve', $challenge['challengeId'], $proof));
        $denied = $service->decide($session, $host->host_id, $device['id'], 'deny', $challenge['challengeId'], $proof);
        $this->assertNotNull($denied->denied_at);
        $this->rejected(fn () => app(RemoteDeviceProof::class)->challenge($session, $device['id'], 'passkey'));
    }

    public function test_expired_proof_and_stale_computer_generation_are_rejected(): void
    {
        $fixture = $this->fixture(); [$session, $host, , $phone, , $device] = $fixture; $this->approve($fixture);
        $service = app(RemoteDeviceProof::class); $challenge = $service->challenge($session, $device['id'], 'passkey');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $phone));
        $this->travel(121)->seconds();
        $this->rejected(fn () => $service->consume($session, $device['id'], 'passkey', $challenge['challengeId'], $proof));
        $host->forceFill(['authorization_generation' => 2])->save();
        $this->rejected(fn () => $service->challenge($session, $device['id'], 'passkey'));
    }

    public function test_registration_cannot_silently_widen_approved_permissions(): void
    {
        $fixture = $this->fixture(); [, , , , $headers, $device, $body] = $fixture; $this->approve($fixture);
        $body['permissions'] = ['preview:access', 'terminal:access'];
        $this->postJson('/api/security/devices/register', $body, $headers)->assertOk()->assertJsonPath('device.permissions', ['preview:access']);
        $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'connect', 'permissions' => ['terminal:access']], $headers)->assertForbidden();
    }

    public function test_revocation_invalidates_device_proof_and_ends_its_sessions(): void
    {
        $fixture = $this->fixture(); [$session, $host, , , $headers, $device] = $fixture; $this->approve($fixture);
        $trusted = TrustedDevice::where('uuid', $device['id'])->first();
        RemoteSession::create(['user_id' => $session->user_id, 'remote_host_id' => $host->id, 'trusted_device_id' => $trusted->id,
            'grant_id' => str_repeat('a', 32), 'issued_at' => now(), 'expires_at' => now()->addHour(), 'status' => 'CONNECTED']);
        $this->deleteJson('/api/security/devices/'.$device['id'], [], $headers)->assertOk();
        $this->assertFalse($trusted->fresh()->trusted());
        $this->assertDatabaseHas('remote_sessions', ['trusted_device_id' => $trusted->id, 'status' => 'REVOKED']);
        $this->assertDatabaseCount('remote_session_revocations', 1);
        $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'passkey'], $headers)->assertForbidden();
    }

    public function test_rate_limit_is_bounded_per_device_and_anonymous_requests_fail(): void
    {
        [, , , , $headers, , $body] = $this->fixture();
        $this->postJson('/api/security/devices/register', $body)->assertUnauthorized();
        for ($attempt = 0; $attempt < 9; $attempt++) $this->postJson('/api/security/devices/register', $body, $headers)->assertOk();
        $this->postJson('/api/security/devices/register', $body, $headers)->assertStatus(429);
        $this->travel(61)->seconds();
        $this->postJson('/api/security/devices/register', $body, $headers)->assertOk();
    }

    public function test_a_renewed_pairing_request_invalidates_the_stale_desktop_view(): void
    {
        [$session, $host, $keys, , $headers, $device, $body] = $this->fixture();
        $oldPath = '/api/remote/hosts/'.$host->host_id.'/devices/'.$device['id'];
        $challenge = $this->postJson($oldPath.'/challenge', ['decision' => 'approve'], $headers)->assertOk()->json();
        $this->travel(11)->minutes();
        $body['permissions'] = ['terminal:access'];
        $new = $this->postJson('/api/security/devices/register', $body, $headers)->assertOk()->json('device');
        $this->assertNotSame($device['id'], $new['id']);
        $this->postJson($oldPath.'/challenge', ['decision' => 'approve'], $headers)->assertNotFound();
        $this->postJson($oldPath.'/decision', ['decision' => 'approve', 'challengeId' => $challenge['challengeId'],
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))], $headers)->assertNotFound();
        $this->assertNull(TrustedDevice::first()->approved_at);
    }
}
