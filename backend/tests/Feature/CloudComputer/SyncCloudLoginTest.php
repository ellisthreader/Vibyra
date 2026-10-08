<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Testing\TestResponse;

/** Logins the Mac makes only for Vibyra Cloud (`origin=cloud`, 2026-10-07): Claude and Codex, provider permission enforced, never replaced by a copy. */
class SyncCloudLoginTest extends SyncTestCase
{
    public function test_stale_ack_and_retention_snapshot_cannot_discard_a_replacement_login(): void
    {
        $this->upload('claude', 1)->assertOk();
        $old = \Illuminate\Support\Facades\DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->where('provider', 'claude')->first();
        $this->upload('claude', 2)->assertOk();
        // Reproduce the exact interleaving after applied()/sweep() read the row
        // and receive() commits a newer blob, before cleanup clears the pointer.
        $cleanup = new \ReflectionMethod(\App\Services\CloudComputer\SyncLogins::class, 'dropBlob');
        $cleanup->invoke(app(\App\Services\CloudComputer\SyncLogins::class), $old, ['applied_seq' => 1, 'applied_at' => now()]);
        $current = \Illuminate\Support\Facades\DB::table('cloud_sync_logins')->where('id', $old->id)->first();
        $this->assertSame(2, (int) $current->seq);
        $this->assertNotNull($current->blob_id);
        $this->assertSame(0, (int) $current->applied_seq);
        \Illuminate\Support\Facades\Storage::disk('cloud-sync')->assertExists($current->path);
        $this->assertSame(2, $this->pending()[0]['seq']);
    }

    private string $vm;

    protected function setUp(): void { parent::setUp(); $this->vm = $this->vmReady(); }

    private function access(string $method = 'get', string $path = '', array $body = []): TestResponse
    {
        return $this->withToken('cloud-test')->{$method.'Json'}('/api/cloud-computer/access'.$path, $body);
    }

    private function pending(): array { return $this->asRuntime($this->vm, 'get', 'sync/pending')->assertOk()->json('items'); }

    private function upload(string $provider, int $seq, ?string $origin = 'cloud'): TestResponse
    {
        $content = 'FIXTURE-SEALED-LOGIN-'.bin2hex(random_bytes(32));
        $q = array_filter(['seq' => $seq, 'sha256' => hash('sha256', $content), 'origin' => $origin]);
        return $this->raw('PUT', "/api/cloud-computer/sync/login/{$provider}?".http_build_query($q), $content, 'cloud-test');
    }

    public function test_a_claude_login_made_for_cloud_is_accepted_and_a_claude_copy_is_not(): void
    {
        $this->upload('claude', 1, null)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
        $this->upload('claude', 1)->assertOk()->assertJsonPath('logins.claude.origin', 'cloud')->assertJsonPath('logins.claude.pending', true);
        $items = $this->pending();
        $this->assertSame([['claude', 'cloud']], array_map(fn ($i) => [$i['provider'], $i['origin']], $items));
    }

    public function test_a_codex_login_made_for_cloud_ignores_the_carry_over_block_and_a_later_copy_cannot_replace_it(): void
    {
        $this->access('put', '/providers/codex', ['carryOver' => 'blocked'])->assertOk();
        $this->upload('codex', 1, null)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
        $this->upload('codex', 2)->assertOk()->assertJsonPath('logins.codex.origin', 'cloud');
        $this->access('put', '/providers/codex', ['carryOver' => 'allowed'])->assertOk();
        $this->upload('codex', 3, null)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
        $this->assertSame('cloud', $this->sync('get', '/')->json('logins.codex.origin'));
    }

    public function test_access_reports_each_cloud_login_for_the_phone(): void
    {
        $this->upload('claude', 1)->assertOk();
        $r = $this->access()->assertOk()->json('providers');
        $this->assertSame(['appliedAt' => null, 'pending' => true], $r['claude']['cloudLogin']);
        $this->assertSame(['appliedAt' => null, 'pending' => false], $r['codex']['cloudLogin']);
        $id = $this->pending()[0]['id'];
        $this->asRuntime($this->vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => true])->assertOk();
        $r = $this->access()->json('providers.claude.cloudLogin');
        $this->assertFalse($r['pending']); $this->assertNotNull($r['appliedAt']);
    }

    public function test_taking_a_copy_back_never_removes_a_login_made_for_cloud(): void
    {
        $this->upload('codex', 1)->assertOk();
        $this->sync('delete', '/login/codex')->assertOk()->assertJsonPath('logins.codex.pending', true);
        $this->access('put', '/providers/codex', ['carryOver' => 'blocked'])->assertOk();
        $this->assertTrue($this->sync('get', '/')->json('logins.codex.pending'));
        $this->assertCount(1, $this->pending());
    }
    public function test_disabled_providers_keep_cloud_logins_but_do_not_receive_or_use_them(): void
    {
        $this->asRuntime($this->vm, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'providerPolicyVersion' => 1])->assertOk();
        foreach (['claude', 'codex'] as $provider) {
            $this->upload($provider, 1)->assertOk();
            $this->access('put', '/providers/'.$provider, ['enabled' => false])->assertOk();
            $this->upload($provider, 2)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
            $this->sync('get', '/')->assertJsonPath('logins.'.$provider.'.origin', 'cloud')
                ->assertJsonPath('logins.'.$provider.'.pending', true);
        }
        $this->assertSame([], $this->pending());
        $this->access('put', '/providers/claude', ['enabled' => true])->assertOk();
        $this->assertSame(['claude'], array_column($this->pending(), 'provider'));
    }

    public function test_stale_copy_migration_cannot_delete_a_newer_copy_or_cloud_login(): void
    {
        $this->upload('codex', 1, null)->assertOk();
        $this->upload('codex', 2, null)->assertOk();
        $this->sync('delete', '/login/codex?expectedSeq=1')->assertOk()->assertJsonPath('logins.codex.pending', true);
        $this->sync('delete', '/login/codex?expectedSeq=2')->assertOk()->assertJsonPath('logins.codex.pending', false);
        $this->upload('codex', 3)->assertOk();
        $this->sync('delete', '/login/codex?expectedSeq=3')->assertOk()->assertJsonPath('logins.codex.pending', true);
        $this->sync('delete', '/login/codex?expectedSeq=-1')->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->assertSame('cloud', $this->pending()[0]['origin']);
    }

}
