<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{DB, Storage};

class SyncRuntimeTest extends SyncTestCase
{
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = $this->vmReady();
    }

    private function pending(): array { return $this->asRuntime($this->token, 'get', 'sync/pending')->assertOk()->json(); }
    private function applied(string $id, array $body): \Illuminate\Testing\TestResponse { return $this->asRuntime($this->token, 'post', 'sync/blobs/'.$id.'/applied', $body); }
    private function project(): array { return $this->sync('get', '/')->json('projects.0'); }

    public function test_runtime_auth_refuses_bad_bearers_and_non_computer_workspaces(): void
    {
        foreach (['get' => 'sync/macs', 'post' => 'sync/key'] as $m => $path) {
            $this->asRuntime('wrong-token', $m, $path, ['publicKey' => str_repeat('b2', 32)])->assertStatus(401);
            $this->asRuntime('', $m, $path, ['publicKey' => str_repeat('b2', 32)])->assertStatus(401);
        }
        $this->grant('my-app');
        $this->runtimeRaw('wrong-token', 'PUT', 'projects/my-app/down?'.http_build_query($this->q()[1]), 'x')->assertStatus(401);
        // A hosted (project) workspace's runtime bearer is refused outright.
        $project = (string) \Illuminate\Support\Str::uuid(); $projectToken = 'project-runtime-token';
        DB::table('cloud_workspaces')->insert(['id' => $project, 'kind' => 'project', 'computer_user_id' => null, 'remote_host_id' => null, 'app_name' => 'vibyra-ws-'.str_replace('-', '', $project),
            'runtime_token_hash' => hash('sha256', $projectToken)] + (array) $this->row());
        $this->withToken($projectToken)->getJson('/api/cloud-runtime/'.$project.'/sync/macs')->assertStatus(403);
        $this->withToken($projectToken)->postJson('/api/cloud-runtime/'.$project.'/sync/key', ['publicKey' => str_repeat('b2', 32)])->assertStatus(403);
    }

    public function test_the_vm_key_is_idempotent_and_a_different_key_resets_every_project(): void
    {
        $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $id = $this->pending()['items'][0]['id'];
        $this->applied($id, ['ok' => true, 'state' => 'synced'])->assertOk();
        $this->assertSame(str_repeat('b2', 32), $this->sync('get', '/')->json('vmKey'));
        $this->asRuntime($this->token, 'post', 'sync/key', ['publicKey' => str_repeat('b2', 32)])->assertOk();
        $p = $this->project();
        $this->assertSame([1, false, 'synced'], [$p['upAppliedSeq'], $p['resync'], $p['state']]);
        $this->asRuntime($this->token, 'post', 'sync/key', ['publicKey' => str_repeat('d4', 32)])->assertOk();
        $p = $this->project();
        $this->assertSame([0, true, 'pending'], [$p['upAppliedSeq'], $p['resync'], $p['state']]);
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('direction', 'up')->count());
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $this->asRuntime($this->token, 'post', 'sync/key', ['publicKey' => 'short'])->assertStatus(422)->assertJsonPath('ok', false);
    }

    public function test_macs_lists_registered_macs(): void
    {
        $this->assertSame([], $this->asRuntime($this->token, 'get', 'sync/macs')->json('macs'));
        $this->registerMac();
        $this->assertSame([['id' => $this->deviceId, 'publicKey' => $this->macKey]], $this->asRuntime($this->token, 'get', 'sync/macs')->json('macs'));
    }

    public function test_pending_lists_unapplied_blobs_in_order_and_serves_them_with_ranges(): void
    {
        $this->grant('b-app'); $this->grant('a-app', str_repeat('7e', 16));
        $content = random_bytes(3000);
        $this->up('b-app', ['seq' => 1], $content)->assertOk();
        $this->up('a-app', ['seq' => 1])->assertOk();
        $this->up('b-app', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $this->up('b-app', ['kind' => 'transcripts', 'seq' => 1, 'head' => '-'])->assertOk();
        $items = $this->pending()['items'];
        $this->assertSame([['a-app', 'code', 1], ['b-app', 'code', 1], ['b-app', 'code', 2], ['b-app', 'transcripts', 1]], array_map(fn ($i) => [$i['project'], $i['kind'], $i['seq']], $items));
        $this->assertSame(['id', 'project', 'kind', 'seq', 'baseSeq', 'head', 'bytes', 'sha256'], array_keys($items[0]));
        $first = $items[1];
        $url = '/api/cloud-runtime/'.$this->cid.'/sync/blobs/'.$first['id'];
        $get = fn (?string $range) => $this->call('GET', $url, [], [], [], array_filter(['HTTP_AUTHORIZATION' => 'Bearer '.$this->token, 'HTTP_RANGE' => $range]));
        $full = $get(null)->assertOk();
        $this->assertSame($content, $full->streamedContent());
        $this->assertSame('application/octet-stream', $full->headers->get('Content-Type'));
        $this->assertSame('bytes', $full->headers->get('Accept-Ranges'));
        $part = $get('bytes=100-199')->assertStatus(206);
        $this->assertSame(substr($content, 100, 100), $part->streamedContent());
        $this->assertSame('bytes 100-199/3000', $part->headers->get('Content-Range'));
        $this->assertSame(substr($content, 2900), $get('bytes=2900-')->streamedContent());
        $this->assertSame(substr($content, -50), $get('bytes=-50')->streamedContent());
        $get('bytes=5000-')->assertStatus(416);
        $get('bytes=nonsense')->assertStatus(416);
        $this->call('GET', $url, [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer wrong'])->assertStatus(401);
    }

    public function test_applying_updates_the_project_and_the_listing(): void
    {
        $this->grant('my-app');
        $this->up('my-app', ['seq' => 1])->assertOk();
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        [$one, $two] = array_column($this->pending()['items'], 'id');
        $this->applied($one, ['ok' => true, 'state' => 'synced'])->assertOk();
        $p = $this->project();
        $this->assertSame([1, 'pending'], [$p['upAppliedSeq'], $p['state']]);
        $this->assertNotNull($p['appliedAt']);
        $this->applied($two, ['ok' => true, 'state' => 'diverged'])->assertOk();
        $this->applied($two, ['ok' => true, 'state' => 'synced'])->assertOk(); // idempotent: the first answer stands
        $p = $this->project();
        $this->assertSame([2, 'diverged'], [$p['upAppliedSeq'], $p['state']]);
        $this->assertSame([], $this->pending()['items']);
        $this->assertSame([['name' => 'my-app', 'downSeq' => 0, 'transcriptsDownSeq' => 0, 'upAppliedSeq' => 2, 'upHead' => str_repeat('c', 40)]], $this->asRuntime($this->token, 'get', 'sync/state')->json('projects'));
        $this->applied('00000000-0000-4000-8000-000000000000', ['ok' => true])->assertStatus(404);
    }

    public function test_transcripts_apply_without_touching_the_code_state(): void
    {
        $this->grant('my-app');
        $this->up('my-app')->assertOk(); $this->up('my-app', ['kind' => 'transcripts', 'seq' => 1, 'head' => '-'])->assertOk();
        [$code, $tr] = array_column($this->pending()['items'], 'id');
        $this->applied($code, ['ok' => true])->assertOk();
        $this->applied($tr, ['ok' => true])->assertOk();
        $p = $this->project();
        $this->assertSame([1, 1, 'synced'], [$p['upAppliedSeq'], $p['transcriptsAppliedSeq'], $p['state']]);
    }

    public function test_a_failed_apply_marks_error_and_a_full_bundle_recovers(): void
    {
        $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $this->applied($this->pending()['items'][0]['id'], ['ok' => false, 'error' => 'disk full'])->assertOk();
        $p = $this->project();
        $this->assertSame(['error', 'disk full', true], [$p['state'], $p['reason'], $p['resync']]);
        $this->assertSame([], $this->pending()['items']);
        $this->assertSame(['my-app'], $this->pending()['resync']);
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertStatus(409)->assertJsonPath('code', 'resync_required');
        $this->up('my-app', ['seq' => 2])->assertOk()->assertJsonPath('project.state', 'pending');
        $this->assertCount(1, $this->pending()['items']);
    }

    public function test_need_full_sets_resync_and_hides_incrementals_that_lost_their_base(): void
    {
        $this->grant('my-app');
        $this->up('my-app')->assertOk(); $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $this->applied($this->pending()['items'][0]['id'], ['ok' => false, 'needFull' => true])->assertOk();
        $p = $this->project();
        $this->assertSame(['pending', true], [$p['state'], $p['resync']]);
        $this->assertSame([], $this->pending()['items']); // seq 2 is incremental on a base the VM does not have
        $this->assertSame(['my-app'], $this->pending()['resync']);
        $this->up('my-app', ['seq' => 3])->assertOk();
        $this->assertSame([3], array_column($this->pending()['items'], 'seq'));
    }

    public function test_a_full_bundle_supersedes_older_unapplied_ones(): void
    {
        $this->grant('my-app');
        $this->up('my-app')->assertOk(); $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertOk(); $this->up('my-app', ['seq' => 3])->assertOk();
        $items = $this->pending()['items'];
        $this->assertSame([3], array_column($items, 'seq'));
        $this->applied($items[0]['id'], ['ok' => true])->assertOk();
        $this->assertSame([], $this->pending()['items']);
        $this->assertSame(3, $this->project()['upAppliedSeq']);
    }

    public function test_status_drives_applying_in_the_state_object(): void
    {
        $this->asRuntime($this->token, 'post', 'sync/status', ['applying' => true])->assertOk();
        $this->assertTrue($this->getJson('/api/cloud-computer')->json('computer.sync.applying'));
        $this->travel(11)->minutes();
        $this->assertFalse($this->getJson('/api/cloud-computer')->json('computer.sync.applying'));
        $this->asRuntime($this->token, 'post', 'sync/status', ['applying' => true])->assertOk();
        $this->asRuntime($this->token, 'post', 'sync/status', ['applying' => false])->assertOk();
        $this->assertFalse($this->getJson('/api/cloud-computer')->json('computer.sync.applying'));
        $this->asRuntime($this->token, 'post', 'sync/status', [])->assertStatus(422);
    }

    public function test_a_removed_project_is_listed_for_the_vm_and_its_blobs_are_gone(): void
    {
        $this->grant('my-app'); $this->up('my-app')->assertOk();
        $this->sync('delete', '/projects/my-app')->assertOk();
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $r = $this->pending();
        $this->assertSame(['my-app', [], []], [$r['removed'][0], $r['items'], $r['resync']]);
        $this->assertSame([], $this->asRuntime($this->token, 'get', 'sync/state')->json('projects'));
        $this->assertSame(['my-app'], $this->pending()['removed']);
        $this->travel(2)->days();
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertSame([], $this->pending()['removed']);
    }
}
