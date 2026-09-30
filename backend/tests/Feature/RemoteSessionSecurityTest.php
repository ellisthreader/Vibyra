<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, RemoteSession, User, VibyraSession};
use App\Services\Remote\{RelayAuthorization, RelayTokens, RemoteAccess, RemoteIdentityProof, RemotePresence, RemoteRevocations};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RemoteSessionSecurityTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Support\RemoteSecurityFixture;
    private const SECRET = 'remote-session-test-secret-at-least-32-bytes';
    private int $relayStatus = 200;
    private bool $legacyAck = false;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => self::SECRET,
            'remote.relay_signing_secret' => self::SECRET, 'remote.relay_admin_secret' => self::SECRET,
            'remote.relay_report_secret' => self::SECRET, 'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'grantId' => $this->legacyAck ? null : $request['grantId']], $this->relayStatus));
    }

    private function account(): array
    {
        $user = User::factory()->create();
        $bearer = 'bearer-'.$user->id;
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $bearer),
            'device_name' => 'phone', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        return [$user, $session, ['Authorization' => 'Bearer '.$bearer]];
    }

    private function grant(): array
    {
        [$user, $session, $headers] = $this->account();
        $keys = sodium_crypto_box_keypair(); $id = bin2hex(sodium_crypto_box_publickey($keys));
        $challenge = app(RemoteIdentityProof::class)->challenge($user, $session->id, $id, 'register');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
        app(RemoteAccess::class)->register($user, $id, 'Mac', 'macos', 'test', $session->id, $challenge['challengeId'], $proof);
        $host = RemoteHost::where('host_id', $id)->firstOrFail();
        $host->forceFill(['online_until' => now()->addMinute()])->save();
        $authorization = $this->secureRemoteRequest($user, $session, $host);
        $response = $this->postJson('/api/remote/hosts/'.$id.'/connect', ['clientName' => 'Phone'] + $authorization, $headers)->assertOk();
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        return [$user, $session, $headers, $host, $response->json()];
    }

    private function event(RemoteHost $host, array $grant, string $type, string $client = 'client-1'): int
    {
        return app(RemotePresence::class)->ingest('relay', [['event' => $type, 'hostId' => $host->host_id,
            'userId' => (string) $host->user_id, 'generation' => $host->authorization_generation,
            'jti' => $grant['sessionId'], 'clientId' => $client]]);
    }

    public function test_client_admission_is_single_use_and_renewal_cannot_admit(): void
    {
        [, , , , $grant] = $this->grant(); $auth = app(RelayAuthorization::class);
        $this->assertFalse($auth->allows($grant['token'], true));
        $this->assertTrue($auth->allows($grant['token'], false));
        $this->assertFalse($auth->allows($grant['token'], false));
        $this->assertTrue($auth->allows($grant['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'CONNECTING']);
    }

    public function test_session_binding_rejects_other_app_session_host_and_tampering(): void
    {
        [$user, , , , $grant] = $this->grant();
        $other = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'other'),
            'device_name' => 'other', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $tokens = app(RelayTokens::class); $claims = $tokens->verify($grant['token']); unset($claims['exp']);
        $auth = app(RelayAuthorization::class);
        $this->assertFalse($auth->allows($tokens->mint(array_replace($claims, ['appSessionId' => $other->id]), 300), false));
        $this->assertFalse($auth->allows($tokens->mint(array_replace($claims, ['hostId' => str_repeat('a', 64)]), 300), false));
        $this->assertFalse($auth->allows($grant['token'].'changed', false));
        $this->assertFalse($auth->allows($tokens->mint($claims, -1), false));
        $this->assertTrue($auth->allows($grant['token'], false));
    }

    public function test_hard_expiry_cannot_be_extended_by_renewal_or_presence(): void
    {
        [, , , $host, $grant] = $this->grant(); $auth = app(RelayAuthorization::class);
        $this->assertTrue($auth->allows($grant['token'], false));
        $this->assertSame(1, $this->event($host, $grant, 'session.started'));
        $this->travel(8)->hours();
        $this->assertFalse($auth->allows($grant['token'], true));
        $this->assertSame(0, $this->event($host, $grant, 'session.started'));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'EXPIRED']);
    }

    public function test_presence_cannot_start_unadmitted_or_resurrect_ended_session(): void
    {
        [, , , $host, $grant] = $this->grant();
        $this->assertSame(0, $this->event($host, $grant, 'session.started'));
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        // Reports can arrive out of order; an end before a start is terminal.
        $this->assertSame(1, $this->event($host, $grant, 'session.ended'));
        $this->assertSame(0, $this->event($host, $grant, 'session.started'));
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'ENDED']);
    }

    public function test_session_end_must_match_the_admitted_relay_client(): void
    {
        [, , , $host, $grant] = $this->grant();
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        $this->assertSame(1, $this->event($host, $grant, 'session.started'));
        $this->assertSame(0, $this->event($host, $grant, 'session.started'));
        $this->assertSame(0, $this->event($host, $grant, 'session.ended', 'other-client'));
        $this->assertSame(1, $this->event($host, $grant, 'session.ended'));
    }

    public function test_session_list_read_and_revoke_enforce_ownership(): void
    {
        [, , $headers, , $grant] = $this->grant(); [, , $foreign] = $this->account();
        $path = '/api/remote/sessions/'.$grant['sessionId'];
        $this->getJson('/api/remote/sessions')->assertUnauthorized();
        $this->getJson($path, $foreign)->assertNotFound();
        $this->deleteJson($path, [], $foreign)->assertNotFound();
        $this->getJson('/api/remote/sessions', $foreign)->assertOk()->assertJsonPath('sessions', []);
        $this->getJson($path, $headers)->assertOk()->assertJsonPath('session.status', 'AUTHORIZED');
        $this->getJson('/api/remote/sessions', $headers)->assertOk()->assertJsonCount(1, 'sessions');
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'AUTHORIZED']);
    }

    public function test_revocation_before_presence_is_durable_and_retried(): void
    {
        [, , $headers, $host, $grant] = $this->grant(); $auth = app(RelayAuthorization::class);
        $this->assertTrue($auth->allows($grant['token'], false));
        $this->relayStatus = 503;
        $path = '/api/remote/sessions/'.$grant['sessionId'];
        $this->deleteJson($path, [], $headers)->assertOk()->assertJsonPath('disconnectPending', true)->assertJsonPath('session.status', 'REVOKED');
        $this->assertFalse($auth->allows($grant['token'], true));
        $this->assertFalse($auth->allows($grant['token'], false));
        $this->assertSame(0, $this->event($host, $grant, 'session.started'));
        Http::assertSent(fn ($request) => $request['hostId'] === $host->host_id && $request['grantId'] === $grant['sessionId']);
        $this->deleteJson($path, [], $headers)->assertOk();
        $this->assertDatabaseCount('remote_session_revocations', 1);
        $this->relayStatus = 200; $this->travel(6)->seconds();
        $this->assertSame(1, app(RemoteRevocations::class)->deliver());
        $this->deleteJson($path, [], $headers)->assertOk()->assertJsonPath('disconnectPending', false);
        $this->assertNull($host->fresh()->revoked_at);
    }

    public function test_legacy_relay_ack_does_not_drop_the_outbox(): void
    {
        [, , $headers, , $grant] = $this->grant();
        $this->legacyAck = true;
        $this->postJson('/api/remote/sessions/'.$grant['sessionId'].'/disconnect', [], $headers)
            ->assertOk()->assertJsonPath('disconnectPending', true);
    }

    public function test_authorization_renewals_do_not_extend_thirty_minute_idle_timeout(): void
    {
        [, , , , $grant] = $this->grant(); $auth = app(RelayAuthorization::class);
        $this->assertTrue($auth->allows($grant['token'], false));
        $this->travel(29)->minutes();
        $this->assertTrue($auth->allows($grant['token'], true));
        $this->travel(61)->seconds();
        $this->assertFalse($auth->allows($grant['token'], true, now()->timestamp));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'EXPIRED']);
    }

    public function test_only_recent_client_frame_activity_extends_idle_timeout(): void
    {
        [, , , , $grant] = $this->grant(); $auth = app(RelayAuthorization::class);
        $this->assertTrue($auth->allows($grant['token'], false));
        $this->assertFalse($auth->allows($grant['token'], true, now()->addSecond()->timestamp));
        $this->travel(20)->minutes();
        $this->assertTrue($auth->allows($grant['token'], true, now()->timestamp));
        $this->travel(20)->minutes();
        $this->assertTrue($auth->allows($grant['token'], true));
        $this->travel(11)->minutes();
        $this->assertFalse($auth->allows($grant['token'], true));
    }
}
