<?php
namespace Tests\Feature\CloudComputer;

use App\Models\TrustedDevice;
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use Illuminate\Support\Facades\DB;
use Tests\Support\RemotePasskeyFixture;

/** A cloud-only account (no Mac, no passkey) creates its first passkey from its pending cloud phone: one tap approves and connects. */
class FirstCloudPasskeyTest extends ComputerTestCase
{
    private RemotePasskeyFixture $authenticator;
    private string $phoneKeys;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test', 'remote_security.first_cloud_passkey' => true]);
        $this->authenticator = new RemotePasskeyFixture();
        $this->phoneKeys = sodium_crypto_box_keypair();
        DB::table('passkey_credentials')->delete(); DB::table('remote_strong_auth')->delete(); // a brand-new account: no passkey at all
    }

    private function pendingOnCloud(): array
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        return $this->postJson('/api/security/devices/register', ['hostId' => $this->hostId, 'publicKey' => bin2hex(sodium_crypto_box_publickey($this->phoneKeys)),
            'deviceName' => 'iPhone', 'permissions' => ['terminal:access']])->assertOk()->json('device');
    }

    private function unseal(array $challenge): string
    {
        return base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $this->phoneKeys));
    }

    private function begin(string $deviceId, string $purpose = 'register')
    {
        $c = $this->postJson('/api/security/devices/'.$deviceId.'/challenge', ['purpose' => 'passkey'])->assertOk()->json();
        return $this->postJson('/api/security/passkeys/begin', ['deviceId' => $deviceId, 'purpose' => $purpose, 'challengeId' => $c['challengeId'], 'proof' => $this->unseal($c)]);
    }

    private function finish(array $begin): void
    {
        parse_str(parse_url($begin['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $begin['id'])->first();
        app(PasskeyCeremonies::class)->finish($begin['id'], $ticket['secret'], $this->authenticator->register(base64_decode($row->challenge)));
    }

    public function test_the_first_passkey_from_a_pending_cloud_phone_approves_it_and_connects_with_one_tap(): void
    {
        $device = $this->pendingOnCloud();
        $begin = $this->begin($device['id'])->assertOk()->json();
        $this->finish($begin);
        $this->assertSame(1, DB::table('passkey_credentials')->where('user_id', $this->user->id)->whereNull('revoked_at')->count());
        $this->postJson('/api/remote/hosts/'.$this->hostId.'/devices/'.$device['id'].'/decision', ['decision' => 'approve', 'assertionId' => $begin['id']])
            ->assertOk()->assertJsonPath('device.approvedAt', fn ($v) => $v !== null);
        $this->assertSame('cloud_passkey', TrustedDevice::where('uuid', $device['id'])->value('approved_via'));
        // The same tap opened the strong-auth window: connect needs no second passkey.
        $c = $this->postJson('/api/security/devices/'.$device['id'].'/challenge', ['purpose' => 'connect', 'permissions' => ['terminal:access']])->assertOk();
        $this->postJson('/api/remote/hosts/'.$this->hostId.'/connect', ['clientName' => 'iPhone', 'deviceId' => $device['id'], 'challengeId' => $c->json('challengeId'),
            'proof' => $this->unseal($c->json()), 'permissions' => ['terminal:access']])->assertOk();
    }

    public function test_it_is_off_by_default(): void
    {
        config(['remote_security.first_cloud_passkey' => false]);
        $device = $this->pendingOnCloud();
        $this->begin($device['id'])->assertStatus(403);
        $this->assertSame(0, DB::table('passkey_credentials')->count());
    }

    public function test_an_old_session_cannot_race_the_owner_to_enrol(): void
    {
        $device = $this->pendingOnCloud();
        DB::table('vibyra_sessions')->where('id', $this->session->id)->update(['created_at' => now()->subHours(3)]);
        $this->begin($device['id'])->assertStatus(403);
    }

    public function test_a_computer_with_a_provider_signed_in_is_not_empty(): void
    {
        $device = $this->pendingOnCloud();
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['login_claude' => true]);
        $this->begin($device['id'])->assertStatus(403);
    }

    public function test_an_account_that_already_has_a_passkey_cannot_add_one_from_a_pending_device(): void
    {
        $device = $this->pendingOnCloud();
        DB::table('passkey_credentials')->insert(['user_id' => $this->user->id, 'credential_hash' => hash('sha256', 'x'), 'credential_id' => 'x', 'public_key' => 'k',
            'counter' => 1, 'device_name' => 'other', 'created_at' => now(), 'updated_at' => now()]);
        $this->begin($device['id'])->assertStatus(403);
        $this->assertSame(1, DB::table('passkey_credentials')->count());
    }
}
