<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/**
 * A Mac that refuses a down blob must not strand the project: the refusal becomes `downNeedFull` / `transcriptsNeedFull` in the
 * cloud computer's state read, until a newer blob for that Mac exists (then the sender has started over, or the Mac is up to date).
 */
class SyncNeedFullTest extends SyncTestCase
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

    private function down(string $mac, int $seq, string $kind = 'code', int $baseSeq = 0): string
    {
        $content = random_bytes(900);
        $q = ['kind' => $kind, 'seq' => $seq, 'baseSeq' => $baseSeq, 'head' => $kind === 'code' ? str_repeat('c', 40) : '-', 'sha256' => hash('sha256', $content), 'mac' => $mac];
        $this->runtimeRaw($this->token, 'PUT', 'projects/my-app/down?'.http_build_query($q), $content)->assertOk();
        foreach ($this->sync('get', '/down?mac='.$mac)->assertOk()->json('items') as $item) if ($item['kind'] === $kind && $item['seq'] === $seq) return $item['id'];
        $this->fail('the blob was not listed');
    }

    private function flags(): array
    {
        $p = $this->asRuntime($this->token, 'get', 'sync/state')->assertOk()->json('projects.0');
        $this->assertArrayHasKey('downNeedFull', $p);
        $this->assertArrayHasKey('transcriptsNeedFull', $p);
        return [$p['downNeedFull'], $p['transcriptsNeedFull']];
    }

    private function refuse(string $id, array $extra = []): void
    {
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => false, 'error' => 'Repository lacks these prerequisite commits'] + $extra)->assertOk();
    }

    public function test_a_refused_increment_makes_the_next_bundle_a_full_one_and_clears_when_a_newer_blob_exists(): void
    {
        $this->assertSame([false, false], $this->flags());
        $base = $this->down($this->deviceId, 1);
        $this->sync('post', '/down/'.$base.'/ack', ['applied' => true])->assertOk();
        $first = $this->down($this->deviceId, 2, 'code', 1);
        $this->assertSame(1, DB::table('cloud_sync_blobs')->where('id', $first)->value('base_seq'));
        $this->refuse($first, ['needFull' => true]);
        $this->assertSame([true, false], $this->flags());
        $this->assertStringStartsWith('needs_full', (string) DB::table('cloud_sync_blobs')->where('id', $first)->value('error'));
        // The cloud computer starts over with a full bundle (a newer seq): nothing is flagged any more.
        $full = $this->down($this->deviceId, 3);
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('id', $full)->value('base_seq'));
        $this->assertSame([false, false], $this->flags());
        // That one is refused as well (flagged again), and then taken: cleared by the newer blob again.
        $this->refuse($full, ['needFull' => true]);
        $this->assertSame([true, false], $this->flags());
        $this->sync('post', '/down/'.$this->down($this->deviceId, 4).'/ack', ['applied' => true])->assertOk();
        $this->assertSame([false, false], $this->flags());
    }

    public function test_an_older_mac_that_does_not_say_needfull_is_treated_as_needing_a_full_resend_but_false_is_respected(): void
    {
        $this->refuse($this->down($this->deviceId, 1)); // no needFull key: every older Mac
        $this->assertSame([true, false], $this->flags());
        $this->down($this->deviceId, 2);
        $this->assertSame([false, false], $this->flags());
        $this->refuse($this->down($this->deviceId, 3), ['needFull' => false]);
        $this->assertSame([false, false], $this->flags(), 'a Mac that says a resend would not help is believed');
        $this->assertSame('Repository lacks these prerequisite commits', DB::table('cloud_sync_blobs')->where('seq', 3)->where('direction', 'down')->value('error'));
        $this->sync('post', '/down/'.$this->down($this->deviceId, 4).'/ack', ['applied' => false, 'needFull' => false, 'error' => 'needs_full: diagnostic text'])->assertOk();
        $this->assertSame([false, false], $this->flags(), 'explicit false wins over a reserved marker in free text');
        $this->assertSame('apply_failed: needs_full: diagnostic text', DB::table('cloud_sync_blobs')->where('seq', 4)->where('direction', 'down')->value('error'));
        $this->sync('post', '/down/'.$this->down($this->deviceId, 5).'/ack', ['applied' => false, 'needFull' => false, 'error' => 'needsXfull: diagnostic text'])->assertOk();
        $this->assertSame([false, false], $this->flags(), 'SQL underscore must match the literal marker, not an arbitrary character');
        $this->sync('post', '/down/'.$this->down($this->deviceId, 6).'/ack', ['applied' => false, 'needFull' => false, 'error' => 'NEEDS_FULL: diagnostic text'])->assertOk();
        $this->assertSame([false, false], $this->flags(), 'the reserved marker is case-sensitive on both databases');

    }

    public function test_conversations_are_flagged_apart_from_code(): void
    {
        $this->down($this->deviceId, 1);
        $this->refuse($this->down($this->deviceId, 1, 'transcripts'), ['needFull' => true]);
        $this->assertSame([false, true], $this->flags());
        $this->down($this->deviceId, 2, 'transcripts');
        $this->assertSame([false, false], $this->flags());
    }

    public function test_one_macs_refusal_counts_even_when_another_took_the_blob_and_it_is_judged_per_mac(): void
    {
        $a = $this->down($this->deviceId, 1);
        $b = $this->down($this->second, 1);
        $this->sync('post', '/down/'.$b.'/ack', ['applied' => true])->assertOk();
        $this->refuse($a, ['needFull' => true]);
        $this->assertSame([true, false], $this->flags());
        $this->down($this->second, 2); // only the other Mac got the newer one: the refusing Mac still needs a full bundle
        $this->assertSame([true, false], $this->flags());
        $this->down($this->deviceId, 2);
        $this->assertSame([false, false], $this->flags());
    }

    public function test_the_refusal_survives_the_day_of_retention_and_lapses_after_a_week(): void
    {
        $this->refuse($this->down($this->deviceId, 1), ['needFull' => true]);
        $this->travel(25)->hours();
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertSame([true, false], $this->flags(), 'the flag outlives the acked-blob retention');
        $this->travel(8)->days();
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $this->assertSame([false, false], $this->flags());
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('direction', 'down')->count());
    }
    public function test_invalid_ack_flags_and_other_accounts_cannot_request_a_resend(): void
    {
        $id = $this->down($this->deviceId, 1);
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => false, 'needFull' => 'invalid'])->assertStatus(422);
        [, $other] = $this->otherAccount();
        $this->sync('post', '/down/'.$id.'/ack', ['applied' => false, 'needFull' => true], $other)->assertStatus(404);
        $this->assertNull(DB::table('cloud_sync_blobs')->where('id', $id)->value('failed_at'));
        $this->assertSame([false, false], $this->flags());
        $this->asRuntime('wrong-runtime', 'get', 'sync/state')->assertStatus(401);
    }

    public function test_replacing_or_evicting_a_recipient_drops_its_refusal_flag(): void
    {
        $id = $this->down($this->deviceId, 1);
        $this->refuse($id, ['needFull' => true]);
        $this->assertSame([true, false], $this->flags());
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => bin2hex(sodium_crypto_box_publickey(sodium_crypto_box_keypair())), 'name' => 'Fresh Mac'])->assertOk();
        $this->assertDatabaseMissing('cloud_sync_blobs', ['id' => $id]);
        $this->assertSame([false, false], $this->flags());
        $id = $this->down($this->second, 1);
        $this->refuse($id, ['needFull' => true]);
        $this->assertSame([true, false], $this->flags());
        // Exceed the registration cap after making this recipient the oldest; eviction uses the real registry path.
        DB::table('cloud_sync_macs')->where('device_id', $this->second)->update(['last_seen_at' => now()->subDay()]);
        for ($i = 0; $i < 4; $i++) $this->sync('put', '/macs/'.\Illuminate\Support\Str::uuid(), ['publicKey' => $this->macKey, 'name' => 'New Mac', 'replace' => true])->assertOk();
        $this->assertDatabaseMissing('cloud_sync_macs', ['device_id' => $this->second]);
        $this->assertDatabaseMissing('cloud_sync_blobs', ['id' => $id]);
        $this->assertSame([false, false], $this->flags());
    }

}
