<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, RemoteSession, User, VibyraSession};
use App\Services\Remote\RelayAuthorization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\RemoteSecurityFixture;
use Tests\TestCase;

class RemoteSecurityPolicyTest extends TestCase
{
    use RefreshDatabase, RemoteSecurityFixture;
    private const SECRET = 'remote-security-policy-test-secret-32-bytes';

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => self::SECRET, 'remote.relay_signing_secret' => self::SECRET,
            'remote.relay_report_secret' => self::SECRET, 'remote.relay_admin_secret' => self::SECRET,
            'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'grantId' => $request['grantId']]));
    }

    private function fixture(string $mode = 'ask'): array
    {
        $user = User::factory()->create(); $token = 'policy-'.$user->id;
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'phone',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $keys = sodium_crypto_box_keypair();
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(sodium_crypto_box_publickey($keys)),
            'name' => 'Mac', 'registered_at' => now(), 'online_until' => now()->addHour(), 'authorization_generation' => 1, 'remote_access_mode' => $mode]);
        $authorization = $this->secureRemoteRequest($user, $session, $host, trustedMode: false);
        return [$session, $host, $keys, ['Authorization' => 'Bearer '.$token], $authorization];
    }

    private function solve(array $challenge, string $keys): array
    {
        return ['challengeId' => $challenge['challengeId'], 'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))];
    }

    public function test_account_session_alone_never_grants_remote_access(): void
    {
        [, $host, , $headers, $authorization] = $this->fixture('trusted'); $path = '/api/remote/hosts/'.$host->host_id.'/connect';
        $this->postJson($path, [], $headers)->assertForbidden()->assertJsonPath('code', 'remote_authorization_required');
        DB::table('remote_strong_auth')->delete();
        $this->postJson($path, $authorization, $headers)->assertForbidden()->assertJsonPath('code', 'strong_auth_required');
        $this->assertDatabaseCount('remote_sessions', 0);
    }

    public function test_passkey_freshness_revocation_and_device_host_binding_are_required(): void
    {
        [$app, $host, , $headers, $authorization] = $this->fixture('trusted'); $path = '/api/remote/hosts/'.$host->host_id.'/connect';
        DB::table('remote_strong_auth')->update(['verified_at' => now()->subMinutes(6), 'expires_at' => now()->addHour()]);
        $this->postJson($path, $authorization, $headers)->assertForbidden();
        DB::table('remote_strong_auth')->update(['verified_at' => now()]);
        DB::table('passkey_credentials')->update(['revoked_at' => now()]);
        $this->postJson($path, $authorization, $headers)->assertForbidden();
        DB::table('passkey_credentials')->update(['revoked_at' => null]);
        $other = RemoteHost::create(['user_id' => $app->user_id, 'host_id' => str_repeat('b', 64), 'name' => 'Other',
            'registered_at' => now(), 'online_until' => now()->addHour(), 'authorization_generation' => 1, 'remote_access_mode' => 'trusted']);
        $this->postJson('/api/remote/hosts/'.$other->host_id.'/connect', $authorization, $headers)->assertForbidden();
        $this->postJson($path, $authorization, $headers)->assertOk()->assertJsonPath('status', 'AUTHORIZED');
    }

    public function test_ask_mode_requires_exact_computer_approval_then_fresh_phone_proof(): void
    {
        [$app, $host, $keys, $headers, $authorization] = $this->fixture();
        $grant = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertOk()
            ->assertJsonPath('status', 'WAITING_FOR_APPROVAL')->json();
        $this->assertArrayNotHasKey('token', $grant);
        $id = $grant['sessionId']; $base = '/api/remote/hosts/'.$host->host_id.'/sessions/'.$id;
        $this->getJson('/api/remote/hosts/'.$host->host_id.'/sessions/pending', $headers)->assertOk()->assertJsonCount(1, 'sessions');
        $challenge = $this->postJson($base.'/challenge', ['decision' => 'allow'], $headers)->assertOk()->json();
        $this->assertSame(['preview:access'], $challenge['parameters']['permissions']);
        $this->postJson($base.'/decision', ['decision' => 'deny'] + $this->solve($challenge, $keys), $headers)->assertForbidden();
        $this->postJson($base.'/decision', ['decision' => 'allow'] + $this->solve($challenge, $keys), $headers)->assertOk()->assertJsonPath('status', 'AUTHORIZED');
        $this->postJson('/api/remote/sessions/'.$id.'/token', $authorization, $headers)->assertForbidden();
        $fresh = $this->freshRemoteProof($app, $authorization['deviceId']);
        $token = $this->postJson('/api/remote/sessions/'.$id.'/token', $fresh, $headers)->assertOk()->json('token');
        $response = $this->postJson('/api/remote/relay/authorize', ['token' => $token], ['Authorization' => 'Bearer '.self::SECRET])->assertOk()->assertJsonPath('allowed', true);
        $signed = $response->json('authorization');
        $this->assertStringStartsWith('ra1.', $signed);
        [$version, $body, $signature] = explode('.', $signed);
        $this->assertTrue(sodium_crypto_sign_verify_detached(base64_decode(strtr($signature, '-_', '+/')), 'ra1.'.$body,
            base64_decode(app(\App\Services\Remote\RemoteSessionTokens::class)->publicKey())));
        $claims = json_decode(base64_decode(strtr($body, '-_', '+/')), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame((string) $app->user_id, $claims['sub']);
        $this->assertSame($host->authorization_generation, $claims['generation']);
        $this->assertFalse(app(RelayAuthorization::class)->allows($token, false));
    }

    public function test_remote_enable_requires_computer_key_and_disable_ends_sessions(): void
    {
        [$app, $host, $keys, $headers, $authorization] = $this->fixture('disabled'); $base = '/api/remote/hosts/'.$host->host_id.'/security';
        $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertForbidden()->assertJsonPath('code', 'remote_disabled');
        $this->postJson($base, ['mode' => 'trusted'], $headers)->assertForbidden();
        $challenge = $this->postJson($base.'/challenge', ['mode' => 'trusted'], $headers)->assertOk()->json();
        $this->postJson($base, ['mode' => 'ask'] + $this->solve($challenge, $keys), $headers)->assertForbidden();
        $this->postJson($base, ['mode' => 'trusted'] + $this->solve($challenge, $keys), $headers)->assertOk();
        $grant = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertOk()->json();
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        $this->postJson('/api/remote/disable', [], $headers)->assertOk()->assertJsonPath('disabled', true);
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'REVOKED']);
        $this->assertDatabaseCount('remote_strong_auth', 0);
        $this->assertSame('disabled', $host->fresh()->remote_access_mode);
        $this->postJson($base, ['mode' => 'trusted'] + $this->solve($challenge, $keys), $headers)->assertForbidden();
    }

    public function test_denied_and_expired_session_requests_cannot_receive_tokens(): void
    {
        [$app, $host, $keys, $headers, $authorization] = $this->fixture();
        $id = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertOk()->json('sessionId');
        $base = '/api/remote/hosts/'.$host->host_id.'/sessions/'.$id;
        $challenge = $this->postJson($base.'/challenge', ['decision' => 'deny'], $headers)->assertOk()->json();
        $this->postJson($base.'/decision', ['decision' => 'deny'] + $this->solve($challenge, $keys), $headers)->assertOk();
        $this->postJson('/api/remote/sessions/'.$id.'/token', $authorization, $headers)->assertStatus(409);
        $fresh = $this->freshRemoteProof($app, $authorization['deviceId']);
        $id = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $fresh, $headers)->assertOk()->json('sessionId');
        $this->travel(301)->seconds();
        $this->getJson('/api/remote/sessions/'.$id, $headers)->assertOk()->assertJsonPath('session.status', 'EXPIRED');
        $this->postJson('/api/remote/hosts/'.$host->host_id.'/sessions/'.$id.'/challenge', ['decision' => 'allow'], $headers)->assertStatus(409);
    }

    public function test_policy_approval_and_kill_endpoints_cannot_cross_accounts(): void
    {
        [, $first, , $firstHeaders, $firstProof] = $this->fixture();
        [, $second, , $secondHeaders] = $this->fixture('trusted');
        $id = $this->postJson('/api/remote/hosts/'.$first->host_id.'/connect', $firstProof, $firstHeaders)->assertOk()->json('sessionId');
        $base = '/api/remote/hosts/'.$first->host_id;
        $this->getJson($base.'/security', $secondHeaders)->assertNotFound();
        $this->postJson($base.'/security', ['mode' => 'disabled'], $secondHeaders)->assertNotFound();
        $this->getJson($base.'/sessions/pending', $secondHeaders)->assertNotFound();
        $this->postJson($base.'/sessions/'.$id.'/challenge', ['decision' => 'allow'], $secondHeaders)->assertNotFound();
        $this->postJson('/api/remote/disable', [], $firstHeaders)->assertOk();
        $this->assertSame('trusted', $second->fresh()->remote_access_mode);
    }

    public function test_an_authorized_but_unused_session_cannot_be_reminted_after_five_minutes(): void
    {
        [$app, $host, , $headers, $authorization] = $this->fixture('trusted');
        $grant = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertOk()->json();
        $this->travel(301)->seconds();
        $fresh = $this->freshRemoteProof($app, $authorization['deviceId']);
        $device = \App\Models\TrustedDevice::where('uuid', $authorization['deviceId'])->firstOrFail();
        $this->strongRemoteFixture($app, $device);
        $this->postJson('/api/remote/sessions/'.$grant['sessionId'].'/token', $fresh, $headers)->assertStatus(409);
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], false));
        $this->getJson('/api/remote/sessions/'.$grant['sessionId'], $headers)->assertOk()->assertJsonPath('session.status', 'EXPIRED');
    }
    public function test_client_admission_cannot_fall_back_to_unsigned_relay_authorization(): void
    {
        [, $host, , $headers, $authorization] = $this->fixture('trusted');
        $grant = $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect', $authorization, $headers)->assertOk()->json();
        $this->mock(\App\Services\Remote\RemoteAuthorizationLease::class)->shouldReceive('issue')->once()->andReturn(null);
        $this->postJson('/api/remote/relay/authorize', ['token' => $grant['token']], ['Authorization' => 'Bearer '.self::SECRET])
            ->assertOk()->assertJsonPath('allowed', false)->assertJsonMissingPath('authorization');
    }

}
