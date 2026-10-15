<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** The two hooks the switching contract asks of the sync channel: owner rows leave with a project, and a Mac that placed conversations files `returned`. */
class SyncReturnHooksTest extends SyncTestCase
{
    private const ID = '5d0c1f4e-7a39-4c0e-9b84-2a6d3f1c8e77';
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = $this->vmReady();
        $this->registerMac();
        $this->grant('my-app');
    }

    private function downBlob(string $kind): string
    {
        $content = random_bytes(1500);
        $q = ['kind' => $kind, 'seq' => 1, 'baseSeq' => 0, 'head' => $kind === 'code' ? str_repeat('c', 40) : '-', 'sha256' => hash('sha256', $content), 'mac' => $this->deviceId];
        $this->runtimeRaw($this->token, 'PUT', 'projects/my-app/down?'.http_build_query($q), $content)->assertOk();
        foreach ($this->sync('get', '/down?mac='.$this->deviceId)->assertOk()->json('items') as $item) if ($item['kind'] === $kind) return $item['id'];
        $this->fail('the blob was not listed');
    }

    private function events(): array
    {
        return $this->getJson('/api/cloud-computer/activity?since='.rawurlencode(now()->subDay()->toIso8601String()))->assertOk()->json('events');
    }

    public function test_acknowledging_a_conversations_download_files_a_returned_event_once(): void
    {
        $id = $this->downBlob('transcripts');
        $this->assertSame([], $this->events());
        $body = ['applied' => true, 'returned' => [['provider' => 'claude', 'id' => self::ID], ['provider' => 'codex', 'id' => 'not valid!'], ['provider' => 'nope', 'id' => 'x']]];
        // An invalid entry fails the whole acknowledgement rather than half-filing it.
        $this->sync('post', '/down/'.$id.'/ack', $body)->assertStatus(422);
        $this->assertNull(DB::table('cloud_sync_blobs')->where('id', $id)->value('applied_at'));
        $body['returned'] = [['provider' => 'claude', 'id' => self::ID]];
        $this->sync('post', '/down/'.$id.'/ack', $body)->assertOk();
        $e = $this->events();
        $this->assertCount(1, $e);
        $this->assertSame(['claude', self::ID, 'my-app', 'returned', 'returned'], [$e[0]['provider'], $e[0]['id'], $e[0]['project'], $e[0]['phase'] ?? 'returned', $e[0]['kind']]);
        $this->sync('post', '/down/'.$id.'/ack', $body)->assertOk(); // a repeated ack changes nothing
        $this->assertCount(1, $this->events());
        $this->assertSame(1, DB::table('cloud_host_events')->where('phase', 'returned')->count());
    }

    public function test_only_applied_conversation_downloads_file_events(): void
    {
        $failed = $this->downBlob('transcripts');
        $this->sync('post', '/down/'.$failed.'/ack', ['applied' => false, 'error' => 'bad', 'returned' => [['provider' => 'claude', 'id' => self::ID]]])->assertOk();
        $this->assertSame([], $this->events());
        $content = random_bytes(900);
        $q = ['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40), 'sha256' => hash('sha256', $content), 'mac' => $this->deviceId];
        $this->runtimeRaw($this->token, 'PUT', 'projects/my-app/down?'.http_build_query($q), $content)->assertOk();
        $code = collect($this->sync('get', '/down?mac='.$this->deviceId)->json('items'))->firstWhere('kind', 'code')['id'];
        $this->sync('post', '/down/'.$code.'/ack', ['applied' => true, 'returned' => [['provider' => 'claude', 'id' => self::ID]]])->assertOk();
        $this->assertSame([], $this->events(), 'a code bundle is not a conversation');
    }

    public function test_removing_a_project_from_sync_puts_its_conversations_back_on_the_pc(): void
    {
        $this->putJson('/api/cloud-computer/owners/claude/'.self::ID, ['project' => 'my-app', 'to' => 'cloud', 'generation' => 0])->assertOk();
        $this->putJson('/api/cloud-computer/owners/codex/'.self::ID, ['project' => 'other-app', 'to' => 'pc', 'generation' => 0])->assertOk();
        $this->assertSame(2, DB::table('cloud_conversation_owners')->count());
        $this->sync('delete', '/projects/my-app')->assertOk();
        $rows = collect($this->getJson('/api/cloud-computer/owners')->assertOk()->json('owners'))->keyBy('project');
        // The record stays as a PC one with its generation bumped (a counter that restarted at 0 would let a stale writer win).
        $this->assertSame(['pc', 2], [$rows['my-app']['owner'], $rows['my-app']['generation']]);
        $this->assertSame(['pc', 1], [$rows['other-app']['owner'], $rows['other-app']['generation']]);
    }
}
