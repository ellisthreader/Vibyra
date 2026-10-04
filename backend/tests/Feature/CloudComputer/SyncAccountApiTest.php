<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SyncAccountApiTest extends SyncTestCase
{
    public function test_a_mac_registers_and_updates_its_key_and_the_listing_shows_it(): void
    {
        $mac = $this->registerMac();
        $this->assertSame(['id' => $this->deviceId, 'name' => 'My Mac', 'publicKey' => $this->macKey], array_intersect_key($mac, array_flip(['id', 'name', 'publicKey'])));
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => str_repeat('c3', 32), 'name' => 'Renamed'])->assertOk()->assertJsonPath('mac.name', 'Renamed');
        $r = $this->sync('get', '/')->assertOk();
        $this->assertTrue($r->json('enabled'));
        $this->assertNull($r->json('vmKey'));
        $this->assertCount(1, $r->json('macs'));
        $this->assertSame(str_repeat('c3', 32), $r->json('macs.0.publicKey'));
        $this->assertSame(0, $r->json('usedBytes'));
        $this->assertSame(5368709120, $r->json('limitBytes'));
        $this->assertSame([], $r->json('projects'));
    }

    public function test_bad_mac_requests_are_refused_in_the_contract_shape(): void
    {
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => 'nope', 'name' => 'x'])->assertStatus(422)->assertJsonPath('ok', false)->assertJsonStructure(['code', 'message', 'error']);
        $this->sync('put', '/macs/not-a-uuid', ['publicKey' => $this->macKey, 'name' => 'x'])->assertClientError();
    }

    public function test_at_most_five_macs_unless_the_oldest_unused_is_replaced(): void
    {
        $ids = [];
        for ($i = 0; $i < 5; $i++) { $ids[] = (string) Str::uuid(); $this->registerMac('cloud-test', $ids[$i]); $this->travel(1)->minutes(); }
        $this->sync('put', '/macs/'.Str::uuid(), ['publicKey' => $this->macKey, 'name' => 'Sixth'])->assertStatus(409)->assertJsonPath('code', 'too_many_macs');
        $this->sync('put', '/macs/'.Str::uuid(), ['publicKey' => $this->macKey, 'name' => 'Sixth', 'replace' => true])->assertOk();
        $listed = array_column($this->sync('get', '/')->json('macs'), 'id');
        $this->assertCount(5, $listed);
        $this->assertNotContains($ids[0], $listed);
    }

    public function test_granting_a_project_is_idempotent_and_returns_the_name(): void
    {
        $a = $this->grant('my-app');
        $this->assertSame('my-app', $a['name']);
        $this->assertSame($this->key, $a['projectKey']);
        $this->assertSame(['pending', 0, false, null], [$a['state'], $a['upSeq'], $a['resync'], $a['upHead']]);
        $b = $this->grant('another-name');
        $this->assertSame('my-app', $b['name']);
        $this->assertCount(1, $this->sync('get', '/')->json('projects'));
    }

    public function test_a_name_clash_with_another_project_gets_the_key_suffix(): void
    {
        $this->grant('app');
        $other = str_repeat('9f', 16);
        $p = $this->grant('app', $other);
        $this->assertSame('app-9f9f', $p['name']);
        $this->assertSame('app-9f9f', $this->grant('app', $other)['name']);
        $long = str_repeat('x', 64);
        $this->grant($long, str_repeat('1a', 16));
        $this->assertSame(substr($long, 0, 59).'-2b2b', $this->grant($long, str_repeat('2b', 16))['name']);
    }

    public function test_a_name_used_by_a_cloned_cloud_project_is_also_taken(): void
    {
        $this->createComputer();
        DB::table('cloud_computer_projects')->insert(['id' => (string) Str::uuid(), 'workspace_id' => $this->cid, 'name' => 'cloned', 'state' => 'done', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame('cloned-'.substr($this->key, 0, 4), $this->grant('cloned')['name']);
    }

    public function test_invalid_project_names_and_keys_are_refused(): void
    {
        foreach ([['projectKey' => $this->key, 'name' => '.hidden'], ['projectKey' => $this->key, 'name' => 'a b'], ['projectKey' => $this->key, 'name' => 'x.lock'],
            ['projectKey' => 'ABC', 'name' => 'ok'], ['projectKey' => $this->key]] as $body) {
            $this->sync('post', '/projects', $body)->assertStatus(422)->assertJsonPath('ok', false);
        }
    }

    public function test_a_project_the_mac_cannot_sync_is_recorded_as_skipped_and_recovers_on_upload(): void
    {
        $p = $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'huge', 'skipped' => ['reason' => 'too_large']])->assertOk()->json('project');
        $this->assertSame(['skipped', 'too_large'], [$p['state'], $p['reason']]);
        $this->grant('huge');
        $this->assertSame('pending', $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'huge'])->json('project.state'));
    }

    public function test_removing_a_project_hides_it_and_is_idempotent(): void
    {
        $this->grant('gone');
        $this->sync('delete', '/projects/gone')->assertOk();
        $this->sync('delete', '/projects/gone')->assertOk();
        $this->sync('delete', '/projects/never-existed')->assertOk();
        $this->assertSame([], $this->sync('get', '/')->json('projects'));
    }

    public function test_the_account_api_needs_a_session_and_an_eligible_account(): void
    {
        $this->withToken('')->getJson('/api/cloud-computer/sync')->assertStatus(401);
        [$free, $token] = $this->otherAccount();
        DB::table('membership_periods')->where('user_id', $free->id)->delete();
        $this->sync('get', '/', [], $token)->assertStatus(402)->assertJsonPath('ok', false)->assertJsonPath('code', 'not_eligible');
        config(['cloud_workspaces.enabled' => false]);
        $this->sync('get', '/')->assertStatus(503)->assertJsonPath('code', 'not_eligible');
    }

    public function test_the_api_works_while_the_computer_is_stopped_or_missing(): void
    {
        $this->assertNull(DB::table('cloud_workspaces')->where('id', $this->cid)->first());
        $this->grant('no-computer-yet');
        $this->createComputer();
        $this->assertSame('stopped', $this->postJson('/api/cloud-computer/stop')->json('computer.state'));
        $this->sync('get', '/')->assertOk()->assertJsonCount(1, 'projects');
    }

    public function test_accounts_never_see_each_others_macs_or_projects(): void
    {
        $this->registerMac(); $this->grant('mine');
        [, $token] = $this->otherAccount();
        $r = $this->sync('get', '/', [], $token)->assertOk();
        $this->assertSame([], $r->json('macs')); $this->assertSame([], $r->json('projects'));
        // Same projectKey and name are independent per account; nothing leaks.
        $this->assertSame('mine', $this->grant('mine', null, $token)['name']);
        $this->up('mine', [], null, $token)->assertOk();
        $this->assertSame(0, $this->sync('get', '/')->json('projects.0.upSeq'));
        $this->sync('delete', '/projects/mine', [], $token)->assertOk();
        $this->assertCount(1, $this->sync('get', '/')->json('projects'));
        $this->sync('get', '/down?mac='.$this->deviceId, [], $token)->assertNotFound();
    }
}
