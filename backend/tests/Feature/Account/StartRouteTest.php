<?php
namespace Tests\Feature\Account;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\CloudComputer\SyncTestCase;

/** docs/start-route-contract.md: no Mac = connect gate; Cloud with a synced, allowed project = cloud; otherwise the Mac. */
class StartRouteTest extends SyncTestCase
{
    private string $mac;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mac = (string) Str::uuid();
    }

    private function route(): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/account/start')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    }

    private function link(array $body = ['name' => 'MacBook Pro', 'platform' => 'macos', 'appVersion' => '0.8.21']): \Illuminate\Testing\TestResponse
    {
        return $this->putJson('/api/account/macs/'.$this->mac, $body);
    }

    private function syncedProject(bool $allowed = true): void
    {
        $this->createComputer();
        $key = str_repeat('c', 32);
        DB::table('cloud_sync_projects')->insert(['user_id' => $this->user->id, 'project_key' => $key, 'name' => 'my-app', 'state' => 'synced',
            'applied_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cloud_project_access')->insert(['user_id' => $this->user->id, 'project_key' => $key, 'name' => 'my-app', 'allowed' => $allowed,
            'source' => 'mac', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_an_account_with_no_mac_must_connect_one(): void
    {
        // The fixture's host row has no app version (like an agent runtime), so it is not a Mac the person signed into.
        $this->route()->assertJsonPath('route', 'connect')->assertJsonPath('macs', []);
    }

    public function test_linking_a_mac_moves_the_phone_to_it(): void
    {
        $this->link()->assertOk()->assertJsonPath('ok', true);
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('macs.0.id', 'mac:'.$this->mac)
            ->assertJsonPath('macs.0.name', 'MacBook Pro')->assertJsonPath('macs.0.online', false)->assertJsonPath('plan.tier', 'pro');
    }

    public function test_relinking_updates_and_forgetting_returns_to_connect(): void
    {
        $this->link()->assertOk();
        $this->link(['name' => 'Studio'])->assertOk();
        $this->assertSame(1, DB::table('linked_macs')->where('user_id', $this->user->id)->count());
        $this->route()->assertJsonPath('macs.0.name', 'Studio');
        $this->deleteJson('/api/account/macs/'.$this->mac)->assertOk();
        $this->route()->assertJsonPath('route', 'connect');
        $this->link()->assertOk(); // signing in again brings it back
        $this->route()->assertJsonPath('route', 'mac');
    }

    public function test_a_mac_registered_for_remote_access_counts_once_with_its_online_state(): void
    {
        DB::table('remote_hosts')->insert(['user_id' => $this->user->id, 'host_id' => str_repeat('d', 64), 'name' => 'MacBook Pro', 'platform' => 'macos',
            'app_version' => '0.8.21', 'registered_at' => now(), 'online_until' => now()->addMinute(), 'authorization_generation' => 1,
            'remote_access_mode' => 'enabled', 'created_at' => now(), 'updated_at' => now()]);
        $this->link()->assertOk();
        $s = $this->route()->assertJsonPath('route', 'mac')->json();
        $this->assertCount(1, $s['macs']);
        $this->assertSame(str_repeat('d', 64), $s['macs'][0]['hostId']);
        $this->assertTrue($s['macs'][0]['online']);
    }

    public function test_cloud_with_a_synced_allowed_project_starts_in_cloud(): void
    {
        $this->link()->assertOk();
        $this->syncedProject();
        $this->route()->assertJsonPath('route', 'cloud')->assertJsonPath('cloud.ready', true)->assertJsonPath('cloud.projects', 1);
    }

    public function test_cloud_without_an_allowed_synced_project_stays_on_the_mac(): void
    {
        $this->link()->assertOk();
        $this->syncedProject(false);
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('cloud.connected', true)->assertJsonPath('cloud.ready', false);
    }

    public function test_a_free_account_with_a_mac_goes_to_the_mac_even_with_cloud_data(): void
    {
        $this->link()->assertOk();
        $this->syncedProject();
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete(); // trial or subscription ended
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('plan.tier', 'free')->assertJsonPath('cloud.enabled', false);
    }

    public function test_a_cloud_computer_host_is_never_a_mac(): void
    {
        $id = DB::table('remote_hosts')->insertGetId(['user_id' => $this->user->id, 'host_id' => str_repeat('e', 64), 'name' => 'Cloud', 'platform' => 'cloud',
            'app_version' => '1', 'registered_at' => now(), 'authorization_generation' => 1, 'remote_access_mode' => 'enabled', 'created_at' => now(), 'updated_at' => now()]);
        $this->route()->assertJsonPath('route', 'connect');
        $this->assertNotNull($id);
    }

    /** The Mac's link with its computer key, proven by opening a `link-mac` challenge sealed to that key. */
    private function linkWithKey(string $keys, string $token = 'cloud-test'): \Illuminate\Testing\TestResponse
    {
        $key = bin2hex(sodium_crypto_box_publickey($keys));
        $c = $this->withToken($token)->postJson('/api/remote/hosts/challenge', ['hostId' => $key, 'action' => 'link-mac'])->assertOk()->json();
        $proof = sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $keys);
        return $this->withToken($token)->putJson('/api/account/macs/'.$this->mac, ['name' => 'MacBook Pro', 'hostKey' => $key,
            'challengeId' => $c['challengeId'], 'proof' => base64_encode($proof === false ? random_bytes(32) : $proof)]);
    }

    public function test_a_proven_computer_key_is_listed_so_the_phone_can_check_the_mac_it_pairs_with(): void
    {
        $keys = sodium_crypto_box_keypair();
        $this->linkWithKey($keys)->assertOk();
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('macs.0.hostId', bin2hex(sodium_crypto_box_publickey($keys)));
    }

    public function test_a_computer_key_without_its_proof_is_refused_and_not_stored(): void
    {
        $key = bin2hex(sodium_crypto_box_publickey(sodium_crypto_box_keypair()));
        $this->link(['name' => 'Mac', 'hostKey' => $key])->assertStatus(409)->assertJsonPath('code', 'proof_invalid');
        $c = $this->postJson('/api/remote/hosts/challenge', ['hostId' => $key, 'action' => 'link-mac'])->assertOk()->json();
        $this->link(['name' => 'Mac', 'hostKey' => $key, 'challengeId' => $c['challengeId'], 'proof' => base64_encode(random_bytes(32))])->assertStatus(409);
        $this->assertSame(0, DB::table('linked_macs')->whereNotNull('host_key')->count());
    }

    public function test_another_account_cannot_claim_this_macs_key(): void
    {
        $keys = sodium_crypto_box_keypair();
        $this->linkWithKey($keys)->assertOk();
        [, $other] = $this->otherAccount();
        // Without the Mac's private key the other account can only send a guess.
        $key = bin2hex(sodium_crypto_box_publickey($keys));
        $c = $this->withToken($other)->postJson('/api/remote/hosts/challenge', ['hostId' => $key, 'action' => 'link-mac'])->assertOk()->json();
        $this->withToken($other)->putJson('/api/account/macs/'.$this->mac, ['name' => 'Not mine', 'hostKey' => $key,
            'challengeId' => $c['challengeId'], 'proof' => base64_encode(random_bytes(32))])->assertStatus(409);
        $this->withToken($other)->getJson('/api/account/start')->assertOk()->assertJsonPath('route', 'connect');
    }

    public function test_link_validates_and_is_per_account(): void
    {
        $this->link(['name' => ''])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->putJson('/api/account/macs/not-a-uuid', ['name' => 'x'])->assertClientError(); // not a route
        $this->link()->assertOk();
        [, $other] = $this->otherAccount();
        $this->withToken($other)->getJson('/api/account/start')->assertOk()->assertJsonPath('route', 'connect');
    }
}
