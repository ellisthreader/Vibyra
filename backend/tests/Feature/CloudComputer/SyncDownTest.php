<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{DB, Storage};

/** The way back: the cloud computer seals a bundle per Mac, each Mac lists, downloads and acknowledges its own. */
class SyncDownTest extends SyncTestCase
{
    private string $token;
    private string $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = $this->vmReady();
        $this->second = (string) \Illuminate\Support\Str::uuid();
        $this->registerMac(); $this->registerMac('cloud-test', $this->second);
        $this->grant('my-app');
    }

    private function down(string $mac, array $over = [], ?string $content = null, ?string $token = null): \Illuminate\Testing\TestResponse
    {
        [$content, $q] = $this->q(array_merge(['seq' => 1, 'baseSeq' => 0], $over), $content);
        return $this->runtimeRaw($token ?? $this->token, 'PUT', 'projects/my-app/down?'.http_build_query($q + ['mac' => $mac]), $content);
    }
    private function list(string $mac, string $token = 'cloud-test'): array { return $this->sync('get', '/down?mac='.$mac, [], $token)->assertOk()->json('items'); }

    public function test_one_upload_per_mac_and_each_mac_lists_only_its_own(): void
    {
        $content = random_bytes(4000);
        $this->down($this->deviceId, [], $content)->assertOk();
        $this->down($this->second, ['head' => str_repeat('d', 40)])->assertOk();
        $mine = $this->list($this->deviceId);
        $this->assertCount(1, $mine);
        $this->assertSame(['project' => 'my-app', 'kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40), 'bytes' => 4000, 'sha256' => hash('sha256', $content)],
            array_intersect_key($mine[0], array_flip(['project', 'kind', 'seq', 'baseSeq', 'head', 'bytes', 'sha256'])));
        $this->assertNotEmpty($mine[0]['createdAt']);
        $this->assertSame(str_repeat('d', 40), $this->list($this->second)[0]['head']);
        $p = $this->sync('get', '/')->json('projects.0');
        $this->assertSame([1, str_repeat('d', 40)], [$p['cloudSeq'], $p['cloudHead']]); // the latest upload wins
        $this->assertNotNull($p['cloudAt']);
        $this->assertSame(1, $this->asRuntime($this->token, 'get', 'sync/state')->json('projects.0.downSeq'));
    }

    public function test_down_seq_may_repeat_per_mac_but_never_skip_or_go_back(): void
    {
        $this->down($this->deviceId)->assertOk();
        $this->down($this->deviceId, ['seq' => 3, 'baseSeq' => 1])->assertStatus(409)->assertJsonPath('expected', 2);
        $this->down($this->second)->assertOk();                                  // same number for the other Mac
        $this->down($this->deviceId, ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $this->down($this->deviceId, ['seq' => 1, 'baseSeq' => 0])->assertStatus(409)->assertJsonPath('expected', 3);
        $this->down($this->deviceId, ['kind' => 'transcripts', 'head' => '-'])->assertOk();
        $this->assertSame(2, $this->asRuntime($this->token, 'get', 'sync/state')->json('projects.0.downSeq'));
        $this->assertSame(1, $this->asRuntime($this->token, 'get', 'sync/state')->json('projects.0.transcriptsDownSeq'));
        // Replaying a seq for the same Mac replaces the earlier copy.
        $this->down($this->deviceId, ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $this->assertCount(1, DB::table('cloud_sync_blobs')->where('direction', 'down')->where('kind', 'code')->where('seq', 2)->get());
    }

    public function test_down_uploads_check_the_mac_the_checksum_and_the_bearer(): void
    {
        $this->down((string) \Illuminate\Support\Str::uuid())->assertStatus(404)->assertJsonPath('code', 'unknown_mac');
        $this->down($this->deviceId, ['sha256' => str_repeat('0', 64)])->assertStatus(422)->assertJsonPath('code', 'sha_mismatch');
        $this->down($this->deviceId, [], null, 'wrong')->assertStatus(401);
        config(['cloud_workspaces.sync_max_blob_bytes' => 1000]);
        $this->down($this->deviceId, [], random_bytes(1001))->assertStatus(413)->assertJsonPath('code', 'too_large');
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
    }

    public function test_a_mac_downloads_with_ranges_and_acks_and_an_acked_blob_goes_after_a_day(): void
    {
        $content = random_bytes(2500);
        $this->down($this->deviceId, [], $content)->assertOk();
        $id = $this->list($this->deviceId)[0]['id'];
        $url = '/api/cloud-computer/sync/down/'.$id;
        $get = fn (?string $range, string $token = 'cloud-test') => $this->call('GET', $url, [], [], [], array_filter(['HTTP_AUTHORIZATION' => 'Bearer '.$token, 'HTTP_RANGE' => $range]));
        $this->assertSame($content, $get(null)->assertOk()->streamedContent());
        $this->assertNotNull(DB::table('cloud_sync_blobs')->where('id', $id)->value('fetched_at'));
        $part = $get('bytes=10-19')->assertStatus(206);
        $this->assertSame(substr($content, 10, 10), $part->streamedContent());
        $get('bytes=9999-')->assertStatus(416);
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => true])->assertOk();
        $this->assertSame([], $this->list($this->deviceId));
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => false, 'error' => 'late'])->assertOk(); // idempotent
        $this->assertNull(DB::table('cloud_sync_blobs')->where('id', $id)->value('failed_at'));
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        $this->travel(25)->hours();
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $this->assertSame(0, DB::table('cloud_sync_blobs')->count());
    }

    public function test_a_rejected_blob_is_acked_with_an_error_and_not_listed_again(): void
    {
        $this->down($this->deviceId)->assertOk();
        $id = $this->list($this->deviceId)[0]['id'];
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => false, 'error' => 'bad tag'])->assertOk();
        $this->assertSame([], $this->list($this->deviceId));
        $this->assertSame('bad tag', DB::table('cloud_sync_blobs')->where('id', $id)->value('error'));
    }

    public function test_other_accounts_cannot_list_fetch_or_ack_my_downloads(): void
    {
        $this->down($this->deviceId)->assertOk();
        $id = $this->list($this->deviceId)[0]['id'];
        [, $other] = $this->otherAccount();
        $this->sync('get', '/down?mac='.$this->deviceId, [], $other)->assertStatus(404);
        $this->withToken($other)->get('/api/cloud-computer/sync/down/'.$id)->assertStatus(404);
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => true], $other)->assertStatus(404);
        $this->assertCount(1, $this->list($this->deviceId));
        $this->sync('get', '/down', [])->assertStatus(422);
    }

    public function test_replacing_a_macs_key_drops_what_was_sealed_for_the_old_one(): void
    {
        $this->down($this->deviceId)->assertOk(); $this->down($this->second)->assertOk();
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => str_repeat('e5', 32), 'name' => 'My Mac'])->assertOk();
        $this->assertSame([], $this->list($this->deviceId));
        $this->assertCount(1, $this->list($this->second));
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
    }
}
