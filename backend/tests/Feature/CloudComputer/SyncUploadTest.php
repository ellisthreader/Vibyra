<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{DB, Storage};

class SyncUploadTest extends SyncTestCase
{
    public function test_final_quota_refusal_does_not_prune_files_inside_a_rollback(): void
    {
        $this->grant('my-app');
        $retention = \Mockery::mock(\App\Services\CloudComputer\SyncRetention::class)->makePartial();
        $retention->shouldReceive('usedBytes')->andReturn(0, 8192, 8192);
        $retention->shouldReceive('limitBytes')->andReturn(4096);
        $retention->shouldNotReceive('prune');
        app()->instance(\App\Services\CloudComputer\SyncRetention::class, $retention);
        $this->up('my-app')->assertStatus(413)->assertJsonPath('code', 'quota_exceeded');
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('cloud_sync_blobs')->count());
        $this->assertSame([], \Illuminate\Support\Facades\Storage::disk('cloud-sync')->allFiles());
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->grant('my-app');
    }

    private function project(): array { return $this->sync('get', '/')->json('projects.0'); }
    private function blobs(): \Illuminate\Support\Collection { return DB::table('cloud_sync_blobs')->orderBy('seq')->get(); }

    public function test_a_first_upload_is_stored_sealed_bytes_and_marks_the_project_pending(): void
    {
        $content = random_bytes(5 * 1048576 + 17);
        $r = $this->up('my-app', ['seq' => 1], $content)->assertOk();
        $this->assertSame(['pending', 1, str_repeat('c', 40), strlen($content)], [$r->json('project.state'), $r->json('project.upSeq'), $r->json('project.upHead'), $r->json('project.bytes')]);
        $this->assertNotNull($r->json('project.upSyncedAt'));
        $blob = $this->blobs()->first();
        $this->assertSame('up', $blob->direction); $this->assertSame('code', $blob->kind); $this->assertNull($blob->recipient_mac_id);
        $this->assertSame(hash('sha256', $content), hash('sha256', Storage::disk('cloud-sync')->get($blob->path)));
        $this->assertSame(strlen($content), Storage::disk('cloud-sync')->size($blob->path));
        $this->assertSame(strlen($content), $this->sync('get', '/')->json('usedBytes'));
        $this->assertEmpty(array_filter(glob(sys_get_temp_dir().'/vsync*') ?: []));
    }

    public function test_seq_must_follow_the_last_one_per_kind(): void
    {
        $this->up('my-app', ['seq' => 2])->assertStatus(409)->assertJsonPath('code', 'seq_conflict')->assertJsonPath('expected', 1);
        $this->up('my-app', ['seq' => 1])->assertOk();
        $this->up('my-app', ['seq' => 1])->assertStatus(409)->assertJsonPath('expected', 2);
        $this->up('my-app', ['seq' => 3, 'baseSeq' => 1])->assertStatus(409)->assertJsonPath('expected', 2);
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        // Transcripts count on their own.
        $this->up('my-app', ['kind' => 'transcripts', 'seq' => 1, 'head' => '-'])->assertOk()->assertJsonPath('project.transcriptsSeq', 1);
        $this->up('my-app', ['kind' => 'transcripts', 'seq' => 3, 'head' => '-'])->assertStatus(409)->assertJsonPath('expected', 2);
        $p = $this->project();
        $this->assertSame([2, 1], [$p['upSeq'], $p['transcriptsSeq']]);
        $this->assertCount(3, $this->blobs());
    }

    public function test_an_incremental_needs_a_lower_base_and_resync_demands_a_full_bundle(): void
    {
        $this->up('my-app', ['seq' => 1, 'baseSeq' => 1])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->up('my-app', ['seq' => 1])->assertOk();
        DB::table('cloud_sync_projects')->update(['resync' => true]);
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertStatus(409)->assertJsonPath('code', 'resync_required');
        $this->assertTrue($this->project()['resync']);
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 0])->assertOk()->assertJsonPath('project.resync', false);
        $this->up('my-app', ['seq' => 3, 'baseSeq' => 2])->assertOk();
    }

    public function test_a_wrong_checksum_is_refused_and_leaves_nothing_behind(): void
    {
        $this->up('my-app', ['sha256' => str_repeat('0', 64)])->assertStatus(422)->assertJsonPath('code', 'sha_mismatch');
        $this->assertCount(0, $this->blobs());
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $this->assertSame(0, $this->project()['upSeq']);
        $this->up('my-app', [], '')->assertStatus(422);
    }

    public function test_the_size_cap_is_enforced_while_streaming_and_nothing_is_kept(): void
    {
        config(['cloud_workspaces.sync_max_blob_bytes' => 100000]);
        $this->up('my-app', [], random_bytes(100001))->assertStatus(413)->assertJsonPath('code', 'too_large');
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $this->assertCount(0, $this->blobs());
        $this->up('my-app', [], random_bytes(100000))->assertOk();
    }

    public function test_the_quota_refuses_an_upload_that_would_exceed_it(): void
    {
        config(['cloud_workspaces.sync_quota_bytes' => 10000]);
        $this->up('my-app', ['seq' => 1], random_bytes(6000))->assertOk();
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1], random_bytes(6000))->assertStatus(413)->assertJsonPath('code', 'quota_exceeded');
        $this->assertCount(1, $this->blobs());
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        $this->assertSame(1, $this->project()['upSeq']);
    }

    public function test_the_quota_first_lets_go_of_what_retention_would_drop_anyway(): void
    {
        config(['cloud_workspaces.sync_quota_bytes' => 10000]);
        for ($i = 1; $i <= 3; $i++) { $this->up('my-app', ['seq' => $i, 'baseSeq' => max(0, $i - 1)], random_bytes(3000))->assertOk(); }
        DB::table('cloud_sync_blobs')->update(['applied_at' => now()]);
        $this->up('my-app', ['seq' => 4, 'baseSeq' => 3], random_bytes(3000))->assertOk();
        $this->assertSame([2, 3, 4], $this->blobs()->pluck('seq')->all());
    }

    public function test_bad_queries_and_unknown_projects_are_refused(): void
    {
        $this->up('my-app', ['kind' => 'weird'])->assertStatus(422);
        $this->up('my-app', ['head' => 'abc'])->assertStatus(422);
        $this->up('my-app', ['seq' => 0])->assertStatus(422);
        $this->up('nope')->assertStatus(404)->assertJsonPath('code', 'unknown_project');
        $this->up('bad name!')->assertStatus(404);
    }

    public function test_an_upload_to_another_accounts_project_is_not_found(): void
    {
        [, $token] = $this->otherAccount();
        $this->up('my-app', [], null, $token)->assertStatus(404);
        $this->assertCount(0, $this->blobs());
    }

    public function test_upload_needs_a_session_and_an_eligible_account(): void
    {
        $this->up('my-app', [], null, 'wrong-token')->assertStatus(401);
        config(['cloud_workspaces.enabled' => false]);
        $this->up('my-app')->assertStatus(503)->assertJsonPath('code', 'not_eligible');
        $this->assertCount(0, $this->blobs());
    }

    public function test_retention_keeps_the_three_newest_blobs_and_every_unapplied_one(): void
    {
        for ($i = 1; $i <= 6; $i++) {
            $this->up('my-app', ['seq' => $i, 'baseSeq' => $i - 1])->assertOk();
            if ($i <= 4) DB::table('cloud_sync_blobs')->where('seq', $i)->update(['applied_at' => now()]);
        }
        // Applied 1-3 fall outside the 3 newest (4, 5, 6). Un-applied blobs always stay, however old.
        $this->assertSame([4, 5, 6], $this->blobs()->pluck('seq')->all());
        DB::table('cloud_sync_blobs')->update(['applied_at' => null]);
        $this->up('my-app', ['seq' => 7, 'baseSeq' => 6])->assertOk();
        $this->assertSame([4, 5, 6, 7], $this->blobs()->pluck('seq')->all());
        $this->assertCount(4, Storage::disk('cloud-sync')->allFiles());
    }
}
