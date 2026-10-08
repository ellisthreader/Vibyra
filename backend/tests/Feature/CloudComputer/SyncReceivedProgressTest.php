<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{SyncStatus, SyncUploadProgress};
use Illuminate\Support\Facades\DB;

class SyncReceivedProgressTest extends SyncTestCase
{
    private string $content = 'abcdefgh';

    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.sync_parts_dir' => sys_get_temp_dir().'/vibyra-progress-test-'.getmypid()]);
        $this->vmReady();
        $this->grant('my-app');
    }

    protected function tearDown(): void
    {
        foreach (glob(config('cloud_workspaces.sync_parts_dir').'/*') ?: [] as $file) @unlink($file);
        @rmdir(config('cloud_workspaces.sync_parts_dir'));
        parent::tearDown();
    }

    private function part(int $offset, string $bytes, array $extra = [])
    {
        $q = array_merge(['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40),
            'sha256' => hash('sha256', $this->content), 'offset' => $offset, 'total' => strlen($this->content)], $extra);
        return $this->raw('PUT', '/api/cloud-computer/sync/projects/my-app/up-part?'.http_build_query($q), $bytes, 'cloud-test');
    }

    private function syncStatus(): array
    {
        return app(SyncStatus::class)->forUser($this->user->id)[$this->key];
    }

    public function test_received_chunks_show_progress_without_a_mac_check_in_then_become_saved(): void
    {
        $this->assertDatabaseCount('cloud_sync_macs', 0);
        $this->assertSame('waiting_mac', $this->syncStatus()['phase']);
        $this->part(0, 'ab')->assertOk()->assertJsonPath('received', 2);
        $this->assertSame(['phase' => 'uploading', 'sent' => 2, 'total' => 8],
            array_intersect_key($this->syncStatus(), array_flip(['phase', 'sent', 'total'])));
        $this->assertSame(0, DB::table('cloud_sync_blobs')->count(), 'partial bytes are not a saved project');
        $this->getJson('/api/cloud-computer/access')->assertOk()->assertJsonPath('projects.0.cloud.status.sent', 2);
        $this->part(2, 'cdefgh')->assertOk()->assertJsonPath('complete', true);
        $this->assertSame('saved', $this->syncStatus()['phase']);
        $this->assertArrayNotHasKey('sent', $this->syncStatus());
    }

    public function test_stale_progress_expires_and_a_resumed_chunk_refreshes_it(): void
    {
        $this->part(0, 'ab')->assertOk();
        $this->travel(SyncUploadProgress::FRESH_SECONDS + 1)->seconds();
        $this->assertSame('waiting_mac', $this->syncStatus()['phase']);
        $this->part(2, 'cd')->assertOk();
        $this->assertSame(4, $this->syncStatus()['sent']);
        $this->assertSame(now()->toDateTimeString(), $this->row()->last_activity_at, 'new received bytes refresh the idle clock');
    }

    public function test_resume_conflict_keeps_real_bytes_but_rejected_oversize_clears_them(): void
    {
        $this->part(0, 'ab')->assertOk();
        $this->part(0, 'ab')->assertStatus(409)->assertJsonPath('expected', 2);
        $this->assertSame(2, $this->syncStatus()['sent']);
        $this->part(2, 'cdefghi')->assertStatus(413);
        $this->assertSame('waiting_mac', $this->syncStatus()['phase']);
    }

    public function test_checksum_failure_does_not_leave_a_successful_upload_indicator(): void
    {
        $this->part(0, 'ab')->assertOk();
        $this->part(2, 'xxxxxx')->assertStatus(422)->assertJsonPath('code', 'sha_mismatch');
        $this->assertSame('waiting_mac', $this->syncStatus()['phase']);
    }

    public function test_a_recreated_project_and_another_account_do_not_inherit_old_progress(): void
    {
        $this->part(0, 'ab')->assertOk();
        [$other] = $this->otherAccount();
        $this->assertSame([], app(SyncStatus::class)->forUser($other->id));
        DB::table('cloud_sync_projects')->where('user_id', $this->user->id)->delete();
        $this->grant('my-app');
        $this->assertSame('waiting_mac', $this->syncStatus()['phase']);
    }

    public function test_finishing_an_older_attempt_does_not_clear_a_newer_transfer(): void
    {
        $p = DB::table('cloud_sync_projects')->first(); $progress = app(SyncUploadProgress::class);
        $code = ['kind' => 'code', 'seq' => 1, 'sha256' => str_repeat('a', 64)];
        $history = ['kind' => 'transcripts', 'seq' => 1, 'sha256' => str_repeat('b', 64)];
        $progress->received($p, $code, 2, 8);
        $progress->received($p, $history, 3, 9);
        $progress->clear($p, $code);
        $this->assertSame(['sent' => 3, 'total' => 9], $progress->current($p));
        DB::table('cloud_sync_projects')->where('id', $p->id)->update(['transcripts_seq' => 1]);
        $this->assertNull($progress->current(DB::table('cloud_sync_projects')->first()));
    }
}
