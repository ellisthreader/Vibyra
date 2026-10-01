<?php
namespace Tests\Feature\CloudComputer;

use App\Models\{RemoteHost, TrustedDevice, User};
use App\Services\Remote\{RelayAuthorization, RelayTokens};
use App\Services\CloudWorkspaces\Shutdown;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class HostRegistrationTest extends ComputerTestCase
{
    public function test_valid_proof_binds_and_trusts_the_host_and_audits_it(): void
    {
        $token = $this->computerReady();
        $reply = $this->registerHost($token)->assertOk()->json();
        $this->assertSame('wss://relay.vibyra.test', $reply['relayUrl']);
        $this->assertSame('cloud', $reply['host']['kind']); $this->assertSame($this->cid, $reply['host']['workspaceId']);
        $host = RemoteHost::where('host_id', $this->hostId)->firstOrFail();
        $this->assertSame($this->user->id, (int) $host->user_id);
        $this->assertSame('trusted', $host->remote_access_mode);
        // The headless Host reads this to admit a phone without a local prompt; a missing field must fail closed there.
        $this->assertSame('trusted', $reply['hostPolicy']);
        $this->assertSame($host->id, (int) $this->row()->remote_host_id);
        $this->assertSame(1, DB::table('remote_audit_events')->where('remote_host_id', $host->id)->where('event', 'host.cloud_registered')->count());
        $claims = app(RelayTokens::class)->verify($reply['token']);
        $this->assertSame('host', $claims['role']); $this->assertSame($this->cid, $claims['cloudWorkspace']);
        $this->assertSame($host->authorization_generation, $claims['generation']);
        // The relay keeps admitting this Host while the computer is up, and stops when it sleeps.
        $this->assertTrue(app(RelayAuthorization::class)->allows($reply['token'], true));
        $this->sleepNow();
        $this->assertFalse(app(RelayAuthorization::class)->allows($reply['token'], true));
    }

    public function test_want_trusted_false_leaves_the_policy_on_ask_and_reboots_never_re_upgrade_it(): void
    {
        $token = $this->computerReady();
        $this->registerHost($token, false)->assertOk();
        $host = RemoteHost::where('host_id', $this->hostId)->firstOrFail();
        $this->assertSame('ask', $host->remote_access_mode);
        $revision = $host->security_revision;
        $this->registerHost($token, true)->assertOk();
        $host->refresh();
        $this->assertSame('ask', $host->remote_access_mode);
        $this->assertSame($revision, $host->security_revision);
    }

    public function test_wrong_runtime_token_and_stopped_workspace_cannot_register(): void
    {
        $token = $this->computerReady();
        $this->asRuntime('x'.$token, 'post', 'host/challenge', ['hostId' => $this->hostId])->assertUnauthorized();
        $this->asRuntime($token, 'post', 'host/register', ['hostId' => $this->hostId, 'name' => 'x', 'challengeId' => (string) Str::uuid(), 'proof' => 'AAAA'])->assertStatus(409);
        $this->assertSame(0, RemoteHost::where('host_id', $this->hostId)->count());
        $this->sleepNow();
        $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => $this->hostId])->assertUnauthorized();
    }

    public function test_a_host_key_owned_by_another_account_or_a_mac_can_never_register(): void
    {
        $token = $this->computerReady();
        $other = User::factory()->create(['email_verified_at' => now()]);
        RemoteHost::create(['user_id' => $other->id, 'host_id' => $this->hostId, 'name' => 'Theirs', 'registered_at' => now(),
            'authorization_generation' => 1, 'remote_access_mode' => 'ask']);
        $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => $this->hostId])->assertStatus(409)->assertJsonPath('code', 'host_transfer_required');
        // Forged flow: a challenge minted for this key against the other account's row still cannot register it.
        $this->asRuntime($token, 'post', 'host/register', ['hostId' => $this->hostId, 'name' => 'x', 'challengeId' => (string) Str::uuid(), 'proof' => base64_encode(str_repeat('a', 32))])->assertStatus(409);
        $this->assertSame($other->id, (int) RemoteHost::where('host_id', $this->hostId)->value('user_id'));
        $this->assertNull($this->row()->remote_host_id);
        // The account's own Mac key is not a cloud identity either.
        $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => str_repeat('a', 64)])->assertStatus(409)->assertJsonPath('code', 'host_key_conflict');
        $this->assertSame('enabled', RemoteHost::where('host_id', str_repeat('a', 64))->value('remote_access_mode'));
    }

    public function test_replayed_or_foreign_key_proofs_are_refused(): void
    {
        $token = $this->computerReady();
        $challenge = $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => $this->hostId])->assertOk()->json();
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $this->hostKeys));
        $body = ['hostId' => $this->hostId, 'name' => 'Cloud', 'challengeId' => $challenge['challengeId'], 'proof' => $proof];
        $this->asRuntime($token, 'post', 'host/register', ['proof' => base64_encode(random_bytes(32))] + $body)->assertStatus(409);
        $this->assertSame(0, RemoteHost::where('host_id', $this->hostId)->count());
        $this->asRuntime($token, 'post', 'host/register', $body)->assertOk();
        $this->asRuntime($token, 'post', 'host/register', $body)->assertStatus(409);
        // A different key cannot take over the bound computer while the first identity is active.
        $keys = sodium_crypto_box_keypair();
        $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => bin2hex(sodium_crypto_box_publickey($keys))])->assertStatus(409)->assertJsonPath('code', 'host_key_changed');
        // Once the user removes the old identity the replacement can bind.
        $this->deleteJson('/api/remote/hosts/'.$this->hostId)->assertOk();
        $this->registerHost($token, true, $keys)->assertOk();
    }

    public function test_non_cloud_workspaces_cannot_use_the_host_endpoints(): void
    {
        $id = $this->imported(); $this->start($id);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = DB::table('cloud_workspaces')->where('id', $id)->first();
        $boot = app(\App\Services\CloudWorkspaces\Runtime::class)->bootstrap($id, \Illuminate\Support\Facades\Crypt::decryptString($w->bootstrap_secret), 'machine', 1);
        $this->assertSame('upload', $boot['source']['type']);
        $this->withToken($boot['token']);
        $this->postJson('/api/cloud-runtime/'.$id.'/host/challenge', ['hostId' => $this->hostId])->assertForbidden();
        $this->postJson('/api/cloud-runtime/'.$id.'/host/activity', ['running' => 5, 'waitingApproval' => 0])->assertForbidden();
        $this->getJson('/api/cloud-runtime/'.$id.'/projects/pending')->assertForbidden();
        $this->assertSame(0, RemoteHost::where('host_id', $this->hostId)->count());
    }

    public function test_a_same_account_phone_is_never_approved_silently_for_any_host(): void
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        $register = fn (string $host) => $this->postJson('/api/security/devices/register', ['hostId' => $host, 'publicKey' => bin2hex(random_bytes(32)), 'deviceName' => 'iPhone'])->assertOk()->json('device');
        // The account owns a passkey, yet registering a phone approves nothing (see CloudPasskeyApprovalTest for the passkey path).
        $this->assertGreaterThan(0, DB::table('passkey_credentials')->where('user_id', $this->user->id)->whereNull('revoked_at')->count());
        $cloud = $register($this->hostId);
        $this->assertNull($cloud['approvedAt']);
        $this->assertNull(TrustedDevice::where('uuid', $cloud['id'])->value('approved_at'));
        $this->assertNull($register(str_repeat('a', 64))['approvedAt']);
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        $this->postJson('/api/remote/hosts/'.$this->hostId.'/connect', ['clientName' => 'iPhone'])->assertStatus(403)->assertJsonPath('code', 'remote_authorization_required');
    }
}
