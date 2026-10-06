<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** The Mac's "Keep projects ready for your iPhone": the phone's agreement, proven with the Mac's own computer key. */
class MacConnectTest extends SyncTestCase
{
    private string $macKeys;
    private string $macId;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.mac_connect_enabled' => true]);
        DB::table('cloud_connect_consents')->delete();
        $this->macKeys = sodium_crypto_box_keypair();
        $this->macId = bin2hex(sodium_crypto_box_publickey($this->macKeys));
        DB::table('remote_hosts')->insert(['user_id' => $this->user->id, 'host_id' => $this->macId, 'name' => 'MacBook Pro', 'platform' => 'macos',
            'app_version' => '0.8.21', 'registered_at' => now(), 'authorization_generation' => 1, 'remote_access_mode' => 'enabled',
            'created_at' => now(), 'updated_at' => now()]);
        $this->reachedFromPhone($this->macId);
    }

    /** The person reached this computer from their iPhone (a remote session exists only after Face ID or a passkey). */
    private function reachedFromPhone(string $hostId): void
    {
        DB::table('remote_sessions')->insert(['user_id' => $this->user->id, 'remote_host_id' => DB::table('remote_hosts')->where('host_id', $hostId)->value('id'),
            'grant_id' => bin2hex(random_bytes(16)), 'issued_at' => now(), 'status' => 'ENDED', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_computer_key_never_reached_from_the_phone_cannot_agree(): void
    {
        // A stolen session token can enrol a computer key of its own; that key proves itself but no person ever confirmed it.
        $rogue = sodium_crypto_box_keypair(); $rogueId = bin2hex(sodium_crypto_box_publickey($rogue));
        DB::table('remote_hosts')->insert(['user_id' => $this->user->id, 'host_id' => $rogueId, 'name' => 'Not my Mac', 'platform' => 'macos',
            'registered_at' => now(), 'authorization_generation' => 1, 'remote_access_mode' => 'enabled', 'created_at' => now(), 'updated_at' => now()]);
        $c = $this->postJson('/api/remote/hosts/challenge', ['hostId' => $rogueId, 'action' => 'cloud-connect'])->assertOk()->json();
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $rogue));
        $this->postJson('/api/cloud-computer/connect/mac', ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version'),
            'hostId' => $rogueId, 'challengeId' => $c['challengeId'], 'proof' => $proof])->assertStatus(409)->assertJsonPath('code', 'phone_confirm_required');
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
        $this->assertSame(0, DB::table('cloud_project_access')->where('user_id', $this->user->id)->count());
    }

    /** A fresh `cloud-connect` challenge answered with the Mac's key. */
    private function proven(?string $keys = null, string $action = 'cloud-connect'): array
    {
        $c = $this->postJson('/api/remote/hosts/challenge', ['hostId' => $this->macId, 'action' => $action])->assertOk()->json();
        $proof = sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $keys ?? $this->macKeys);
        return ['hostId' => $this->macId, 'challengeId' => $c['challengeId'], 'proof' => $proof === false ? base64_encode(random_bytes(32)) : base64_encode($proof)];
    }

    private function connect(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/connect/mac', $extra + ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version')]
            + $this->proven());
    }

    public function test_the_mac_connects_records_its_consent_and_its_picked_projects(): void
    {
        $this->connect(['projects' => [['id' => 'proj-1', 'name' => 'my-app']]])->assertOk()->assertJsonPath('connected', true);
        $row = DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->first();
        $this->assertSame('mac', $row->source);
        $this->assertSame(1, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->count());
        $access = DB::table('cloud_project_access')->where('user_id', $this->user->id)->first();
        $this->assertSame(['my-app', true, 'mac'], [$access->name, (bool) $access->allowed, $access->source]);
        $this->sync('get', '')->assertOk()->assertJsonPath('consent.version', (int) config('cloud_workspaces.connect_consent_version'));
    }

    public function test_off_until_the_switch_is_on(): void
    {
        config(['cloud_workspaces.mac_connect_enabled' => false]);
        $this->connect()->assertNotFound()->assertJsonPath('code', 'mac_connect_off');
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
    }

    public function test_a_wrong_key_or_a_reused_or_register_challenge_is_refused(): void
    {
        $body = ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version')];
        $this->postJson('/api/cloud-computer/connect/mac', $body + $this->proven(sodium_crypto_box_keypair()))->assertStatus(409)->assertJsonPath('code', 'proof_invalid');
        $this->postJson('/api/cloud-computer/connect/mac', $body + $this->proven(null, 'register'))->assertStatus(409)->assertJsonPath('code', 'proof_invalid');
        $once = $this->proven();
        $this->postJson('/api/cloud-computer/connect/mac', $body + $once)->assertOk();
        $this->postJson('/api/cloud-computer/connect/mac', $body + $once)->assertStatus(409)->assertJsonPath('code', 'proof_invalid');
    }

    public function test_a_cloud_connect_answer_cannot_be_spent_on_enrolling_the_computer(): void
    {
        $p = $this->proven(); $host = \App\Models\RemoteHost::query()->where('host_id', $this->macId)->first();
        $session = DB::table('vibyra_sessions')->where('user_id', $this->user->id)->value('id');
        $this->expectException(\App\Services\Remote\RemoteAccessException::class);
        app(\App\Services\Remote\RemoteIdentityProof::class)->consume($this->user, (int) $session, $this->macId, $host, $p['challengeId'], $p['proof']);
    }

    public function test_only_a_computer_this_account_owns_can_be_challenged(): void
    {
        DB::table('remote_hosts')->where('host_id', $this->macId)->update(['revoked_at' => now()]);
        $this->postJson('/api/remote/hosts/challenge', ['hostId' => $this->macId, 'action' => 'cloud-connect'])->assertStatus(409);
        $stranger = bin2hex(sodium_crypto_box_publickey(sodium_crypto_box_keypair()));
        $this->postJson('/api/remote/hosts/challenge', ['hostId' => $stranger, 'action' => 'cloud-connect'])->assertStatus(409);
    }

    public function test_a_free_account_is_refused_and_no_consent_is_kept(): void
    {
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete();
        $this->assertGreaterThanOrEqual(400, $this->connect()->status());
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
    }

    public function test_an_outdated_consent_version_is_refused(): void
    {
        $this->connect(['consentVersion' => 1])->assertStatus(409)->assertJsonPath('code', 'consent_outdated');
    }
}
