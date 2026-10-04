<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Testing\TestResponse;

/** Big projects over a weak connection: pieces append, a dropped piece resumes from what arrived, the whole is checked and stored once. */
class SyncUploadPartsTest extends SyncTestCase
{
    private string $content;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.sync_parts_dir' => sys_get_temp_dir().'/vibyra-parts-test-'.getmypid()]);
        $this->grant('big-app');
        $this->content = random_bytes(3 * 1048576 + 123);
    }

    protected function tearDown(): void
    {
        foreach (glob(config('cloud_workspaces.sync_parts_dir').'/*') ?: [] as $f) @unlink($f);
        @rmdir(config('cloud_workspaces.sync_parts_dir'));
        parent::tearDown();
    }

    private function part(int $offset, string $piece, array $over = []): TestResponse
    {
        $q = ['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40), 'sha256' => hash('sha256', $this->content),
            'offset' => $offset, 'total' => strlen($this->content)] + $over;
        return $this->raw('PUT', '/api/cloud-computer/sync/projects/big-app/up-part?'.http_build_query(array_merge($q, $over)), $piece, 'cloud-test');
    }

    public function test_pieces_resume_after_a_drop_and_the_whole_is_stored_once(): void
    {
        $one = substr($this->content, 0, 1048576);
        $this->part(0, $one)->assertOk()->assertJsonPath('complete', false)->assertJsonPath('received', 1048576);
        // The connection dropped mid-piece and the Mac retries the same offset: it is told where to resume.
        $this->part(0, $one)->assertStatus(409)->assertJsonPath('code', 'offset_mismatch')->assertJsonPath('expected', 1048576);
        $this->part(1048576, substr($this->content, 1048576, 2 * 1048576))->assertOk()->assertJsonPath('received', 3 * 1048576);
        $this->assertSame(0, DB::table('cloud_sync_blobs')->count(), 'nothing stored before the last piece');
        $r = $this->part(3 * 1048576, substr($this->content, 3 * 1048576))->assertOk()->assertJsonPath('complete', true);
        $this->assertSame('pending', $r->json('project.state'));
        $blob = DB::table('cloud_sync_blobs')->first();
        $this->assertSame(hash('sha256', $this->content), hash('sha256', Storage::disk('cloud-sync')->get($blob->path)));
        $this->assertSame([], glob(config('cloud_workspaces.sync_parts_dir').'/*.part') ?: [], 'the part file is removed');
    }

    public function test_a_wrong_checksum_is_refused_at_the_end_and_a_stale_seq_at_the_start(): void
    {
        $this->part(0, $this->content, ['sha256' => str_repeat('0', 64)])->assertStatus(422)->assertJsonPath('code', 'sha_mismatch');
        $this->assertSame(0, DB::table('cloud_sync_blobs')->count());
        $this->part(0, 'x', ['seq' => 5])->assertStatus(409)->assertJsonPath('code', 'seq_conflict');
    }

    public function test_pieces_cannot_go_past_the_declared_size_or_the_cap(): void
    {
        $this->part(0, $this->content.'extra')->assertStatus(413);
        config(['cloud_workspaces.sync_max_blob_bytes' => 1024]);
        $this->part(0, 'x')->assertStatus(413)->assertJsonPath('code', 'too_large');
    }

    public function test_another_account_cannot_resume_or_write_the_project(): void
    {
        $this->part(0, substr($this->content, 0, 1024))->assertOk();
        $this->raw('PUT', '/api/cloud-computer/sync/projects/big-app/up-part?'.http_build_query(['kind' => 'code', 'seq' => 1, 'sha256' => hash('sha256', $this->content),
            'offset' => 1024, 'total' => strlen($this->content)]), 'x', 'other-account-token')->assertStatus(401);
    }
}
