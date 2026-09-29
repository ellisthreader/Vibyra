<?php
namespace Tests\Feature;

use App\Models\{RemoteHost, User, VibyraSession};
use App\Services\Remote\{RelayAuthorization, RelayTokens, RemoteAccess, RemoteAccessException, RemoteIdentityProof, RemotePresence, RemoteRevocations};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

class RemoteCloudAuthorizationTest extends TestCase
{
    use RefreshDatabase;
    private int $relayStatus = 200;
    private const SECRET = 'test-relay-secret-with-at-least-32-bytes';
    protected function setUp(): void {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => self::SECRET,
            'remote.relay_admin_secret' => self::SECRET, 'remote.relay_report_secret' => self::SECRET,
            'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'generation' => $request['generation']], $this->relayStatus));
    }
    private function account(): array {
        $user = User::factory()->create();
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'bearer-'.$user->id),
            'device_name' => 'test', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        return [$user, $session];
    }
    private function proof(User $user, VibyraSession $session, string $keys, string $action = 'register'): array {
        $id = bin2hex(sodium_crypto_box_publickey($keys));
        $challenge = app(RemoteIdentityProof::class)->challenge($user, $session->id, $id, $action);
        $plain = sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys);
        return [$id, $challenge['challengeId'], base64_encode($plain)];
    }
    private function enroll(User $user, VibyraSession $session, string $keys, string $action = 'register'): array {
        [$id, $challenge, $proof] = $this->proof($user, $session, $keys, $action);
        return app(RemoteAccess::class)->register($user, $id, 'Mac', 'macos', 'test', $session->id, $challenge, $proof);
    }
    public function test_new_identity_requires_private_key_proof_and_replay_is_denied(): void {
        [$user, $session] = $this->account(); $keys = sodium_crypto_box_keypair();
        [$id, $challenge, $proof] = $this->proof($user, $session, $keys);
        $remote = app(RemoteAccess::class);
        try { $remote->register($user, $id, 'attacker', null, null, $session->id); $this->fail('Unproved enrollment accepted'); }
        catch (RemoteAccessException $e) { $this->assertSame(409, $e->status); }
        $grant = $remote->register($user, $id, 'Mac', null, null, $session->id, $challenge, $proof);
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        $this->assertDatabaseMissing('remote_identity_challenges', ['proof_hash' => $proof]);
        $this->expectException(RemoteAccessException::class);
        $remote->register($user, $id, 'Mac', null, null, $session->id, $challenge, $proof);
    }
    public function test_transfer_requires_explicit_proof_and_fences_previous_generation(): void {
        [$a, $as] = $this->account(); [$b, $bs] = $this->account(); $keys = sodium_crypto_box_keypair();
        $old = $this->enroll($a, $as, $keys); $id = $old['host']['id'];
        try { app(RemoteAccess::class)->register($b, $id, 'Bad', null, null, $bs->id); $this->fail('Transfer accepted'); }
        catch (RemoteAccessException $e) { $this->assertSame(409, $e->status); }
        $new = $this->enroll($b, $bs, $keys, 'transfer');
        $this->assertFalse(app(RelayAuthorization::class)->allows($old['token'], true));
        $this->assertTrue(app(RelayAuthorization::class)->allows($new['token'], false));
        $this->assertSame(2, RemoteHost::first()->authorization_generation);
        $this->assertSame(0, app(RemotePresence::class)->ingest('relay', [['event' => 'host.online', 'hostId' => $id, 'userId' => (string) $a->id, 'generation' => 1]]));
    }
    public function test_revocation_survives_failed_delivery_restart_and_reenrollment(): void {
        [$user, $session] = $this->account(); $keys = sodium_crypto_box_keypair();
        $old = $this->enroll($user, $session, $keys); $id = $old['host']['id'];
        $this->relayStatus = 503;
        $this->assertTrue(app(RemoteAccess::class)->revoke($user, $id));
        $this->assertTrue(app(RemoteRevocations::class)->pending($id));
        $this->assertFalse(app(RelayAuthorization::class)->allows($old['token'], false));
        $this->assertFalse(app(RelayAuthorization::class)->allows($old['token'], true));
        $this->assertFalse(app(RemoteAccess::class)->revoke($user, $id));
        $this->assertSame(1, DB::table('remote_revocations')->count());
        $new = $this->enroll($user, $session, $keys);
        $this->assertFalse(app(RelayAuthorization::class)->allows($old['token'], false));
        $this->assertTrue(app(RelayAuthorization::class)->allows($new['token'], false));
        $this->relayStatus = 200;
        $this->travel(1)->minutes();
        $this->assertSame(1, app(RemoteRevocations::class)->deliver());
        $this->assertFalse(app(RemoteRevocations::class)->pending($id));
    }
    public function test_challenge_is_bound_to_session_and_expiry(): void {
        [$user, $session] = $this->account(); [, $otherSession] = $this->account();
        [$id, $challenge, $proof] = $this->proof($user, $session, sodium_crypto_box_keypair());
        try { app(RemoteAccess::class)->register($user, $id, 'Bad', null, null, $otherSession->id, $challenge, $proof); $this->fail('Session mismatch accepted'); }
        catch (RemoteAccessException $e) { $this->assertSame(409, $e->status); }
        $this->travel(121)->seconds();
        $this->expectException(RemoteAccessException::class);
        app(RemoteAccess::class)->register($user, $id, 'Bad', null, null, $session->id, $challenge, $proof);
    }
    public function test_renewal_ignores_admission_expiry_but_not_logout_or_membership(): void {
        [$user, $session] = $this->account(); $grant = $this->enroll($user, $session, sodium_crypto_box_keypair());
        $claims = app(RelayTokens::class)->verify($grant['token']); unset($claims['exp']);
        $expired = app(RelayTokens::class)->mint($claims, -1);
        $this->assertFalse(app(RelayAuthorization::class)->allows($expired, false));
        $this->assertTrue(app(RelayAuthorization::class)->allows($expired, true));
        $host = RemoteHost::first(); $host->forceFill(['online_until' => now()->addMinute()])->save();
        $client = app(RemoteAccess::class)->connect($user, $host->host_id, 'phone', $session->id);
        $this->assertTrue(app(RelayAuthorization::class)->allows($client['token'], false));
        config(['remote.require_plan' => true]);
        $this->assertFalse(app(RelayAuthorization::class)->allows($client['token'], true));
        $session->revoke('logout');
        $this->assertFalse(app(RelayAuthorization::class)->allows($expired, true));
    }
    public function test_authorization_endpoint_is_authenticated_and_generation_required(): void {
        [$user, $session] = $this->account(); $grant = $this->enroll($user, $session, sodium_crypto_box_keypair());
        $this->postJson('/api/remote/relay/authorize', ['token' => $grant['token']])->assertUnauthorized();
        $this->postJson('/api/remote/relay/authorize', ['token' => $grant['token']], ['Authorization' => 'Bearer '.self::SECRET])->assertOk()->assertJson(['allowed' => true, 'leaseSeconds' => 180]);
        $legacy = app(RelayTokens::class)->mint(['role' => 'host', 'hostId' => $grant['host']['id'], 'userId' => (string) $user->id], 600);
        $this->assertFalse(app(RelayAuthorization::class)->allows($legacy, false));
    }
    public function test_full_enrollment_http_contract_and_challenge_no_store(): void {
        [$user, $session] = $this->account(); $keys = sodium_crypto_box_keypair();
        $id = bin2hex(sodium_crypto_box_publickey($keys));
        $headers = ['Authorization' => 'Bearer bearer-'.$user->id];
        $response = $this->postJson('/api/remote/hosts/challenge', ['hostId' => $id, 'action' => 'register'], $headers)->assertOk();
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $body = ['hostId' => $id, 'name' => 'Mac', 'challengeId' => $response->json('challengeId'),
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($response->json('ciphertext')), $keys))];
        $this->postJson('/api/remote/hosts', $body, $headers)->assertOk();
        $this->postJson('/api/remote/hosts', $body, $headers)->assertStatus(409);
        $this->postJson('/api/remote/hosts', ['hostId' => $id, 'name' => 'Mac'], $headers)->assertStatus(409)
            ->assertJsonPath('code', 'host_update_required');
    }
    public function test_old_proof_and_presence_cannot_reverse_a_b_a_transfer(): void {
        [$a, $as] = $this->account(); [$b, $bs] = $this->account(); $keys = sodium_crypto_box_keypair();
        $first = $this->enroll($a, $as, $keys);
        [$id, $challenge, $proof] = $this->proof($a, $as, $keys);
        $this->enroll($b, $bs, $keys, 'transfer');
        $this->enroll($a, $as, $keys, 'transfer');
        $this->assertSame(3, RemoteHost::first()->authorization_generation);
        $this->assertFalse(app(RelayAuthorization::class)->allows($first['token'], true));
        $this->assertSame(0, app(RemotePresence::class)->ingest('relay', [['event' => 'host.online', 'hostId' => $id, 'userId' => (string) $a->id, 'generation' => 1]]));
        $this->expectException(RemoteAccessException::class);
        app(RemoteAccess::class)->register($a, $id, 'Mac', null, null, $as->id, $challenge, $proof);
    }
    public function test_unproved_transfer_challenge_cannot_preclaim_identity(): void {
        [$a, $as] = $this->account(); [$b, $bs] = $this->account(); $keys = sodium_crypto_box_keypair();
        $id = bin2hex(sodium_crypto_box_publickey($keys));
        $challenge = app(RemoteIdentityProof::class)->challenge($b, $bs->id, $id, 'transfer');
        try { app(RemoteAccess::class)->register($b, $id, 'Bad', null, null, $bs->id, $challenge['challengeId'], base64_encode(random_bytes(32))); $this->fail('Invalid proof accepted'); }
        catch (RemoteAccessException $e) { $this->assertSame(409, $e->status); }
        $this->assertDatabaseCount('remote_hosts', 0);
        $this->enroll($a, $as, $keys);
        $this->assertSame($a->id, RemoteHost::first()->user_id);
    }

}
