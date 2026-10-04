<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Testing\TestResponse;

/** Login carry-over, cloud computer side: pending item, download, ack deletes the file, 24 h sweep, cleanup. */
class SyncLoginRuntimeTest extends SyncTestCase
{
    private string $token;
    private string $sealed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = $this->vmReady();
        $this->sealed = 'FIXTURE-SEALED-LOGIN-'.bin2hex(random_bytes(32));
    }

    private function send(int $seq = 1, ?string $content = null, string $token = 'cloud-test'): TestResponse
    {
        $content ??= $this->sealed;
        return $this->raw('PUT', '/api/cloud-computer/sync/login/codex?'.http_build_query(['seq' => $seq, 'sha256' => hash('sha256', $content)]), $content, $token);
    }
    private function pending(): array { return $this->asRuntime($this->token, 'get', 'sync/pending')->assertOk()->json('items'); }
    private function applied(string $id, array $body): TestResponse { return $this->asRuntime($this->token, 'post', 'sync/blobs/'.$id.'/applied', $body); }
    private function files(): array { return Storage::disk('cloud-sync')->allFiles(); }

    public function test_pending_lists_the_login_and_the_blob_downloads_with_a_range(): void
    {
        $this->assertSame([], $this->pending());
        $this->send(2)->assertOk();
        $items = $this->pending();
        $this->assertCount(1, $items);
        $this->assertSame(['id', 'project', 'provider', 'kind', 'seq', 'bytes', 'sha256'], array_keys($items[0]));
        $this->assertSame([null, 'codex', 'login', 2, strlen($this->sealed), hash('sha256', $this->sealed)], [$items[0]['project'], $items[0]['provider'], $items[0]['kind'], $items[0]['seq'], $items[0]['bytes'], $items[0]['sha256']]);
        $url = '/api/cloud-runtime/'.$this->cid.'/sync/blobs/'.$items[0]['id'];
        $get = fn (?string $range) => $this->call('GET', $url, [], [], [], array_filter(['HTTP_AUTHORIZATION' => 'Bearer '.$this->token, 'HTTP_RANGE' => $range]));
        $full = $get(null)->assertOk();
        $this->assertSame($this->sealed, $full->streamedContent());
        $this->assertSame('application/octet-stream', $full->headers->get('Content-Type'));
        $this->assertSame(substr($this->sealed, 5, 10), $get('bytes=5-14')->assertStatus(206)->streamedContent());
        $this->assertNotNull(DB::table('cloud_sync_logins')->value('fetched_at'));
    }

    public function test_pending_mixes_login_and_project_items_and_the_count_includes_the_login(): void
    {
        $this->registerMac(); $this->grant('my-app'); $this->up('my-app')->assertOk(); $this->send()->assertOk();
        $items = $this->pending();
        $this->assertSame(['login', 'code'], array_map(fn ($i) => $i['kind'], $items));
        $this->assertSame(2, $this->getJson('/api/cloud-computer')->assertOk()->json('computer.sync.pending'));
    }

    public function test_the_file_is_deleted_the_moment_the_vm_acks_ok(): void
    {
        $this->send(3)->assertOk();
        $id = $this->pending()[0]['id'];
        $this->applied($id, ['ok' => true])->assertOk()->assertJsonPath('ok', true);
        $this->assertSame([], $this->files());
        $this->assertSame([], $this->pending());
        $this->assertSame(['seq' => 3, 'appliedSeq' => 3, 'pending' => false], array_intersect_key($this->sync('get', '/')->json('logins.codex'), array_flip(['seq', 'appliedSeq', 'pending'])));
        $this->assertNotNull($this->sync('get', '/')->json('logins.codex.appliedAt'));
        $this->asRuntime($this->token, 'get', 'sync/blobs/'.$id)->assertStatus(404);
        $this->send(3)->assertStatus(409);
        $this->send(4)->assertOk();
    }

    public function test_a_failed_apply_also_deletes_the_file_and_is_not_listed_again(): void
    {
        $this->send(1)->assertOk();
        $id = $this->pending()[0]['id'];
        $this->applied($id, ['ok' => false, 'error' => 'could not apply'])->assertOk();
        $this->assertSame([], $this->files());
        $this->assertSame([], $this->pending());
        $row = DB::table('cloud_sync_logins')->first();
        $this->assertSame([1, 0, null], [(int) $row->seq, (int) $row->applied_seq, $row->blob_id]);
        $this->assertNotNull($row->failed_at);
        $this->assertFalse($this->sync('get', '/')->json('logins.codex.pending'));
        $this->assertNull($this->sync('get', '/')->json('logins.codex.appliedAt'));
    }

    public function test_a_newer_upload_replaces_the_pending_item(): void
    {
        $this->send(1)->assertOk(); $old = $this->pending()[0]['id'];
        $this->send(2, 'FIXTURE-SEALED-NEWER')->assertOk();
        $items = $this->pending();
        $this->assertCount(1, $items);
        $this->assertNotSame($old, $items[0]['id']);
        $this->asRuntime($this->token, 'get', 'sync/blobs/'.$old)->assertStatus(404);
        $this->assertCount(1, $this->files());
    }

    public function test_the_prune_command_drops_a_login_blob_after_24_hours_only(): void
    {
        $this->send(1)->assertOk();
        DB::table('cloud_sync_logins')->update(['uploaded_at' => now()->subHours(23)]);
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertCount(1, $this->files());
        $this->assertCount(1, $this->pending());
        DB::table('cloud_sync_logins')->update(['uploaded_at' => now()->subHours(25)]);
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertSame([], $this->files());
        $this->assertSame([], $this->pending());
        $this->assertSame(1, (int) DB::table('cloud_sync_logins')->value('seq'));
        $this->assertFalse($this->sync('get', '/')->json('logins.codex.pending'));
    }

    public function test_the_runtime_needs_its_own_bearer_and_never_sees_another_accounts_login(): void
    {
        $this->send(1)->assertOk(); $id = $this->pending()[0]['id'];
        $this->asRuntime('wrong-token', 'get', 'sync/pending')->assertStatus(401);
        $this->asRuntime('wrong-token', 'get', 'sync/blobs/'.$id)->assertStatus(401);
        $this->applied($id, ['ok' => true])->assertOk();
        [$other, $token] = $this->otherAccount();
        $this->send(1, 'FIXTURE-OTHER-ACCOUNT', $token)->assertOk();
        $otherId = DB::table('cloud_sync_logins')->where('user_id', $other->id)->value('blob_id');
        $this->assertSame([], $this->pending());
        $this->asRuntime($this->token, 'get', 'sync/blobs/'.$otherId)->assertStatus(404);
        $this->applied($otherId, ['ok' => true])->assertStatus(404);
        $this->assertNotNull(DB::table('cloud_sync_logins')->where('user_id', $other->id)->value('blob_id'));
        $this->assertCount(1, $this->files());
    }

    public function test_a_new_vm_key_drops_the_pending_login_and_clears_what_was_applied(): void
    {
        $this->send(1)->assertOk(); $this->applied($this->pending()[0]['id'], ['ok' => true])->assertOk();
        $this->send(2)->assertOk();
        $this->asRuntime($this->token, 'post', 'sync/key', ['publicKey' => str_repeat('d4', 32)])->assertOk();
        $this->assertSame([], $this->files());
        $this->assertSame(['seq' => 2, 'appliedSeq' => 0, 'pending' => false, 'appliedAt' => null], $this->sync('get', '/')->json('logins.codex'));
    }
}
