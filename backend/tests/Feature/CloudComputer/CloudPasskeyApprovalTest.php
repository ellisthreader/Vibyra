<?php
namespace Tests\Feature\CloudComputer;

use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use App\Services\Remote\RemoteAccessException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\RemotePasskeyFixture;

/** A stolen bearer session must not reach the cloud terminal: only a fresh passkey tap approves a phone for it. */
class CloudPasskeyApprovalTest extends ComputerTestCase
{
    private RemotePasskeyFixture $authenticator;
    private string $phoneKeys;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test']);
        $this->authenticator = new RemotePasskeyFixture();
        $this->phoneKeys = sodium_crypto_box_keypair();
        // Replace the generic fixture passkey with a real one enrolled the legitimate way (an approved device, fresh strong auth).
        $ceremonies = app(PasskeyCeremonies::class);
        $flow = $ceremonies->begin($this->session, $this->device->id, 'register');
        parse_str(parse_url($flow['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $flow['id'])->first();
        $ceremonies->finish($flow['id'], $ticket['secret'], $this->authenticator->register(base64_decode($row->challenge)));
        DB::table('passkey_credentials')->where('credential_id', 'test')->update(['revoked_at' => now()]);
        DB::table('remote_strong_auth')->delete();
    }

    private function cloudHost(): string
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        return $this->hostId;
    }

    private function pending(string $hostId, ?string $key = null): array
    {
        $key ??= bin2hex(sodium_crypto_box_publickey($this->phoneKeys));
        return $this->postJson('/api/security/devices/register', ['hostId' => $hostId, 'publicKey' => $key, 'deviceName' => 'iPhone',
            'permissions' => ['terminal:access']])->assertOk()->json('device');
    }

    private function unseal(array $challenge, ?string $keys = null): string
    {
        return base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys ?? $this->phoneKeys));
    }

    /** The phone's sequence: possession challenge -> begin authenticate -> passkey tap -> returns the ceremony id. */
    private function tap(string $deviceId, ?RemotePasskeyFixture $authenticator = null): string
    {
        $c = $this->postJson('/api/security/devices/'.$deviceId.'/challenge', ['purpose' => 'passkey'])->assertOk()->json();
        $begin = $this->postJson('/api/security/passkeys/begin', ['deviceId' => $deviceId, 'purpose' => 'authenticate',
            'challengeId' => $c['challengeId'], 'proof' => $this->unseal($c)])->assertOk()->json();
        parse_str(parse_url($begin['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $begin['id'])->first();
        app(PasskeyCeremonies::class)->finish($begin['id'], $ticket['secret'], ($authenticator ?? $this->authenticator)->authenticate(base64_decode($row->challenge), random_int(5, 90000)));
        return $begin['id'];
    }

    private function approve(string $hostId, string $deviceId, string $assertion)
    {
        return $this->postJson('/api/remote/hosts/'.$hostId.'/devices/'.$deviceId.'/decision', ['decision' => 'approve', 'assertionId' => $assertion]);
    }

    private function connect(string $hostId, string $deviceId)
    {
        $c = $this->postJson('/api/security/devices/'.$deviceId.'/challenge', ['purpose' => 'connect', 'permissions' => ['terminal:access']]);
        if ($c->status() !== 200) return $c;
        return $this->postJson('/api/remote/hosts/'.$hostId.'/connect', ['clientName' => 'iPhone', 'deviceId' => $deviceId, 'challengeId' => $c->json('challengeId'),
            'proof' => $this->unseal($c->json()), 'permissions' => ['terminal:access']]);
    }

    public function test_a_stolen_session_without_a_passkey_cannot_approve_add_a_passkey_or_connect(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        $this->assertNull($device['approvedAt']);
        $row = TrustedDevice::where('uuid', $device['id'])->firstOrFail();
        $this->assertNull($row->approved_at);
        $this->postJson('/api/remote/hosts/'.$host.'/connect', ['clientName' => 'iPhone', 'deviceId' => $device['id'], 'challengeId' => (string) Str::uuid(),
            'proof' => 'AAAA', 'permissions' => ['terminal:access']])->assertStatus(403);
        // Not approved, so no connect challenge and no connect.
        $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'connect', 'permissions' => ['terminal:access']])
            ->assertStatus(403)->assertJsonPath('code', 'device_not_trusted');
        // No silent approval, no approval with an invented or foreign assertion id, no host-proof route.
        $this->approve($host, $device['id'], (string) Str::uuid())->assertStatus(403)->assertJsonPath('code', 'cloud_passkey_required');
        $this->postJson('/api/remote/hosts/'.$host.'/devices/'.$device['id'].'/challenge', ['decision' => 'approve'])->assertStatus(403);
        // The pending phone cannot start a passkey registration, even with a possession proof.
        $c = $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'passkey'])->assertOk()->json();
        $this->postJson('/api/security/passkeys/begin', ['deviceId' => $device['id'], 'purpose' => 'register',
            'challengeId' => $c['challengeId'], 'proof' => $this->unseal($c)])->assertStatus(403);
        $this->assertSame(1, DB::table('passkey_credentials')->whereNull('revoked_at')->count());
        $this->assertSame(0, DB::table('remote_sessions')->count());
    }

    public function test_an_attacker_authenticator_cannot_approve_and_its_assertion_is_not_an_existing_passkey(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        $c = $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'passkey'])->assertOk()->json();
        $begin = $this->postJson('/api/security/passkeys/begin', ['deviceId' => $device['id'], 'purpose' => 'authenticate',
            'challengeId' => $c['challengeId'], 'proof' => $this->unseal($c)])->assertOk()->json();
        parse_str(parse_url($begin['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $begin['id'])->first();
        try { app(PasskeyCeremonies::class)->finish($begin['id'], $ticket['secret'], (new RemotePasskeyFixture())->authenticate(base64_decode($row->challenge))); $this->fail('Unknown passkey accepted'); }
        catch (RemoteAccessException $error) { $this->assertSame(422, $error->status); }
        $this->approve($host, $device['id'], $begin['id'])->assertStatus(403);
        $this->assertNull(TrustedDevice::where('uuid', $device['id'])->value('approved_at'));
    }

    public function test_a_fresh_passkey_approves_and_connects_with_one_assertion_and_it_cannot_be_replayed(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        $assertion = $this->tap($device['id']);
        $approved = $this->approve($host, $device['id'], $assertion)->assertOk()->json('device');
        $this->assertNotNull($approved['approvedAt']);
        $row = TrustedDevice::where('uuid', $device['id'])->firstOrFail();
        $this->assertSame('cloud_passkey', $row->approved_via);
        $this->assertSame($assertion, $row->approved_assertion_id);
        // Same 5-minute window: connect without a second tap.
        $connect = $this->connect($host, $device['id'])->assertOk();
        $this->assertNotEmpty($connect->json());
        // The consumed assertion cannot approve anything again, here or for another phone.
        $this->approve($host, $device['id'], $assertion)->assertStatus(409);
        $second = $this->pending($host, bin2hex(random_bytes(32)));
        $this->approve($host, $second['id'], $assertion)->assertStatus(403);
        $this->assertNull(TrustedDevice::where('uuid', $second['id'])->value('approved_at'));
        // Past the 5-minute window the visit still reconnects (RemoteVisit); once it has been idle for 30 minutes it cannot.
        $this->travel(301)->seconds();
        DB::table('remote_hosts')->where('host_id', $host)->update(['online_until' => now()->addHour()]);
        $this->connect($host, $device['id'])->assertOk();
        $this->travel(31)->minutes();
        DB::table('remote_hosts')->where('host_id', $host)->update(['online_until' => now()->addMinute()]);
        $this->connect($host, $device['id'])->assertStatus(403)->assertJsonPath('code', 'strong_auth_required');
    }

    public function test_a_stale_assertion_cannot_approve(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        $assertion = $this->tap($device['id']);
        $this->travel(301)->seconds();
        $this->approve($host, $device['id'], $assertion)->assertStatus(403);
    }

    public function test_re_registering_a_device_invalidates_an_earlier_assertion_and_other_accounts_and_sessions_fail(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        $assertion = $this->tap($device['id']);
        // Another app session of the same account cannot use it.
        $other = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'second-session'), 'device_name' => 'stolen',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        $this->withToken('second-session');
        $this->approve($host, $device['id'], $assertion)->assertStatus(403);
        // Another account sees no such computer or device.
        $stranger = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $stranger->id, 'token_hash' => hash('sha256', 'stranger'), 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        $this->withToken('stranger');
        $this->approve($host, $device['id'], $assertion)->assertStatus(404);
        $this->withToken('cloud-test');
        // A wrong ownership generation cannot be approved.
        RemoteHost::where('host_id', $host)->increment('authorization_generation');
        $this->approve($host, $device['id'], $assertion)->assertStatus(409);
        DB::table('trusted_devices')->where('uuid', $device['id'])->update(['authorization_generation' => DB::table('remote_hosts')->where('host_id', $host)->value('authorization_generation')]);
        // Renewed registration rotates the UUID and kills the old assertion.
        $again = $this->pending($host, bin2hex(random_bytes(32)));
        $this->approve($host, $again['id'], $assertion)->assertStatus(403);
        $this->assertNotNull($other->id);
    }

    public function test_a_mac_host_cannot_use_the_passkey_path(): void
    {
        $this->cloudHost();
        $mac = str_repeat('a', 64);
        $device = $this->pending($mac);
        $this->assertNull($device['approvedAt']);
        $c = $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'passkey'])->assertStatus(403);
        $this->approve($mac, $device['id'], (string) Str::uuid())->assertStatus(422);
        $this->assertNull(TrustedDevice::where('uuid', $device['id'])->value('approved_at'));
    }

    public function test_a_non_trusted_cloud_host_cannot_be_approved_by_passkey(): void
    {
        $host = $this->cloudHost();
        $device = $this->pending($host);
        DB::table('remote_hosts')->where('host_id', $host)->update(['remote_access_mode' => 'ask']);
        $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'passkey'])->assertStatus(403);
        $this->approve($host, $device['id'], (string) Str::uuid())->assertStatus(403);
    }

    public function test_adding_a_passkey_needs_a_fresh_assertion_from_an_existing_one(): void
    {
        $this->cloudHost();
        $ceremonies = app(PasskeyCeremonies::class);
        $session = $this->session;
        // The enrolling approved device has no strong auth now (cleared in setUp): refused.
        try { $ceremonies->begin($session, $this->device->id, 'register'); $this->fail('Registered without an assertion'); }
        catch (RemoteAccessException $error) { $this->assertSame('strong_auth_required', $error->errorCode); }
        // A fresh authenticate with the existing passkey unlocks it, once the window allows.
        $flow = $ceremonies->begin($session, $this->device->id, 'authenticate');
        parse_str(parse_url($flow['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $flow['id'])->first();
        $ceremonies->finish($flow['id'], $ticket['secret'], $this->authenticator->authenticate(base64_decode($row->challenge), 50));
        $this->assertArrayHasKey('id', $ceremonies->begin($session, $this->device->id, 'register'));
        $this->travel(301)->seconds();
        $this->expectException(RemoteAccessException::class);
        $ceremonies->begin($session, $this->device->id, 'register');
    }
}
