<?php
namespace Tests\Feature\Account;

use Illuminate\Support\Facades\DB;
use Tests\Feature\CloudComputer\SyncTestCase;

/**
 * docs/start-route-contract.md, read side: no Mac = connect gate; Cloud with a synced, allowed project = cloud; otherwise the Mac.
 * Linking a Mac through PUT/DELETE /api/account/macs is not in this release (it needs the `link-mac` proof), so a Mac here is
 * one that registered for remote access.
 */
class StartRouteTest extends SyncTestCase
{
    private function route(): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/account/start')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    }

    private function mac(string $hostId = 'd'): void
    {
        DB::table('remote_hosts')->insert(['user_id' => $this->user->id, 'host_id' => str_repeat($hostId, 64), 'name' => 'MacBook Pro', 'platform' => 'macos',
            'app_version' => '0.8.21', 'registered_at' => now(), 'online_until' => now()->addMinute(), 'authorization_generation' => 1,
            'remote_access_mode' => 'enabled', 'created_at' => now(), 'updated_at' => now()]);
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

    public function test_a_mac_registered_for_remote_access_moves_the_phone_to_it_with_its_online_state(): void
    {
        $this->mac();
        $s = $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('plan.tier', 'pro')->json();
        $this->assertCount(1, $s['macs']);
        $this->assertSame(str_repeat('d', 64), $s['macs'][0]['hostId']);
        $this->assertTrue($s['macs'][0]['online']);
    }

    public function test_cloud_with_a_synced_allowed_project_starts_in_cloud(): void
    {
        $this->mac();
        $this->syncedProject();
        $this->route()->assertJsonPath('route', 'cloud')->assertJsonPath('cloud.ready', true)->assertJsonPath('cloud.projects', 1);
    }

    public function test_cloud_without_an_allowed_synced_project_stays_on_the_mac(): void
    {
        $this->mac();
        $this->syncedProject(false);
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('cloud.connected', true)->assertJsonPath('cloud.ready', false);
    }

    public function test_a_free_account_with_a_mac_goes_to_the_mac_even_with_cloud_data(): void
    {
        $this->mac();
        $this->syncedProject();
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete(); // trial or subscription ended
        $this->route()->assertJsonPath('route', 'mac')->assertJsonPath('plan.tier', 'free')->assertJsonPath('cloud.enabled', false);
    }

    public function test_a_cloud_computer_host_is_never_a_mac(): void
    {
        DB::table('remote_hosts')->insert(['user_id' => $this->user->id, 'host_id' => str_repeat('e', 64), 'name' => 'Cloud', 'platform' => 'cloud',
            'app_version' => '1', 'registered_at' => now(), 'authorization_generation' => 1, 'remote_access_mode' => 'enabled', 'created_at' => now(), 'updated_at' => now()]);
        $this->route()->assertJsonPath('route', 'connect');
    }

    public function test_it_is_per_account_and_needs_a_session(): void
    {
        $this->mac();
        [, $other] = $this->otherAccount();
        $this->withToken($other)->getJson('/api/account/start')->assertOk()->assertJsonPath('route', 'connect');
        $this->withToken('')->getJson('/api/account/start')->assertStatus(401);
    }
}
