<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Remote\{RemoteAccess, RemoteIdentityProof};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

/** One Face ID (or passkey) per remote visit, and Face ID from the phone's Keychain key instead of the web page. */
class RemoteVisitTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Support\RemoteSecurityFixture;
    private const SECRET = 'remote-visit-test-secret-at-least-32-bytes';

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => self::SECRET,
            'remote.relay_signing_secret' => self::SECRET, 'remote.relay_admin_secret' => self::SECRET,
            'remote.relay_report_secret' => self::SECRET, 'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'grantId' => $request['grantId']]));
    }

    /** @return array{User, VibyraSession, array, RemoteHost, array} */
    private function visit(): array
    {
        $user = User::factory()->create();
        $bearer = 'bearer-'.$user->id;
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $bearer),
            'device_name' => 'phone', 'idle_expires_at' => now()->addDays(2), 'absolute_expires_at' => now()->addDays(2)]);
        $keys = sodium_crypto_box_keypair(); $id = bin2hex(sodium_crypto_box_publickey($keys));
        $challenge = app(RemoteIdentityProof::class)->challenge($user, $session->id, $id, 'register');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
        app(RemoteAccess::class)->register($user, $id, 'Mac', 'macos', 'test', $session->id, $challenge['challengeId'], $proof);
        $host = RemoteHost::where('host_id', $id)->firstOrFail();
        $host->forceFill(['online_until' => now()->addDays(2)])->save();
        $request = $this->secureRemoteRequest($user, $session, $host);
        return [$user, $session, ['Authorization' => 'Bearer '.$bearer], $host, $request];
    }

    private function connect(RemoteHost $host, array $request, array $headers)
    {
        return $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', ['clientName' => 'Phone'] + $request, $headers);
    }

    private function again(VibyraSession $session, array $request): array
    {
        return $this->freshRemoteProof($session, $request['deviceId']);
    }

    public function test_a_dropped_connection_reconnects_without_a_new_confirmation_while_the_visit_is_alive(): void
    {
        [, $session, $headers, $host, $request] = $this->visit();
        $this->connect($host, $request, $headers)->assertOk();
        $this->travel(20)->minutes();
        $this->connect($host, $this->again($session, $request), $headers)->assertOk();
        $this->travel(25)->minutes();
        $this->connect($host, $this->again($session, $request), $headers)->assertOk();
    }

    public function test_the_visit_ends_after_the_idle_window(): void
    {
        [, $session, $headers, $host, $request] = $this->visit();
        $this->connect($host, $request, $headers)->assertOk();
        $this->travel(31)->minutes();
        $this->connect($host, $this->again($session, $request), $headers)->assertForbidden()->assertJsonPath('code', 'strong_auth_required');
    }

    public function test_relay_renewals_keep_the_visit_alive_but_never_past_the_maximum(): void
    {
        [, $session, $headers, $host, $request] = $this->visit();
        $grant = $this->connect($host, $request, $headers)->assertOk()->json();
        $relay = fn (bool $renewal) => $this->postJson('/api/remote/relay/authorize', ['token' => $grant['token'], 'renewal' => $renewal,
            'activityAt' => now()->timestamp], ['Authorization' => 'Bearer '.self::SECRET])->assertOk()->json('allowed');
        $this->assertTrue($relay(false));
        for ($i = 0; $i < 3; $i++) { $this->travel(20)->minutes(); $this->assertTrue($relay(true)); }
        $this->travel(20)->minutes();
        $this->connect($host, $this->again($session, $request), $headers)->assertOk();
        $device = TrustedDevice::where('uuid', $request['deviceId'])->firstOrFail();
        DB::table('remote_strong_auth')->where('trusted_device_id', $device->id)->update(['verified_at' => now()->subHours(8)->subMinute()]);
        $this->connect($host, $this->again($session, $request), $headers)->assertForbidden()->assertJsonPath('code', 'strong_auth_required');
    }

    public function test_revoking_the_device_ends_the_visit(): void
    {
        [, $session, $headers, $host, $request] = $this->visit();
        $this->connect($host, $request, $headers)->assertOk();
        $this->deleteJson('/api/security/devices/'.$request['deviceId'], [], $headers)->assertOk();
        $this->assertDatabaseCount('remote_strong_auth', 0);
    }

    public function test_face_id_confirms_a_visit_without_a_passkey(): void
    {
        [$user, $session, $headers, $host, $request] = $this->visit();
        DB::table('remote_strong_auth')->delete();
        $this->connect($host, $this->again($session, $request), $headers)->assertForbidden()->assertJsonPath('code', 'strong_auth_required');
        $keys = sodium_crypto_box_keypair();
        DB::table('cloud_face_keys')->insert(['user_id' => $user->id, 'session_id' => $session->id,
            'public_key' => bin2hex(sodium_crypto_box_publickey($keys)), 'created_at' => now(), 'updated_at' => now()]);
        $face = $this->postJson('/api/cloud-computer/face-challenge', [], $headers)->assertOk()->json();
        $this->postJson('/api/security/devices/'.$request['deviceId'].'/face', ['face' => ['id' => $face['id'], 'proof' => base64_encode(random_bytes(32))]], $headers)
            ->assertForbidden()->assertJsonPath('code', 'face_required');
        $face = $this->postJson('/api/cloud-computer/face-challenge', [], $headers)->assertOk()->json();
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($face['ciphertext']), $keys));
        $this->postJson('/api/security/devices/'.$request['deviceId'].'/face', ['face' => ['id' => $face['id'], 'proof' => $proof]], $headers)->assertOk();
        // Each Face ID answer works once.
        $this->postJson('/api/security/devices/'.$request['deviceId'].'/face', ['face' => ['id' => $face['id'], 'proof' => $proof]], $headers)->assertForbidden();
        $this->assertDatabaseHas('remote_strong_auth', ['app_session_id' => $session->id, 'method' => 'face', 'passkey_credential_id' => null]);
        $this->travel(3)->minutes(); // past the pause that several refusals in a row start
        $this->connect($host, $this->again($session, $request), $headers)->assertOk();
        // The Face ID key is this sign-in's: without it the confirmation no longer counts.
        DB::table('cloud_face_keys')->delete();
        $this->connect($host, $this->again($session, $request), $headers)->assertForbidden();
    }

    public function test_face_id_is_refused_for_another_accounts_device_or_a_session_without_a_key(): void
    {
        [, $session, $headers, , $request] = $this->visit();
        $this->postJson('/api/security/devices/'.$request['deviceId'].'/face', ['face' => ['id' => (string) \Illuminate\Support\Str::uuid(), 'proof' => base64_encode(random_bytes(32))]], $headers)
            ->assertForbidden()->assertJsonPath('code', 'face_required');
        [, , $otherHeaders] = $this->visit();
        $this->postJson('/api/security/devices/'.$request['deviceId'].'/face', ['face' => ['id' => (string) \Illuminate\Support\Str::uuid(), 'proof' => base64_encode(random_bytes(32))]], $otherHeaders)
            ->assertNotFound();
    }
}
