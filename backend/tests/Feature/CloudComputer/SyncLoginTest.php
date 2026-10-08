<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\AccountCleanup;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Testing\TestResponse;

/** Login carry-over, account side (fixture bytes only: the backend never opens a sealed login). */
class SyncLoginTest extends SyncTestCase
{
    protected function login(array $over = [], ?string $content = null, string $token = 'cloud-test'): TestResponse
    {
        $content ??= 'FIXTURE-SEALED-LOGIN-'.bin2hex(random_bytes(64));
        $q = array_merge(['seq' => 1, 'sha256' => hash('sha256', $content)], $over);
        return $this->raw('PUT', '/api/cloud-computer/sync/login/codex?'.http_build_query($q), $content, $token);
    }

    protected function files(): array { return Storage::disk('cloud-sync')->allFiles(); }

    public function test_index_reports_empty_logins_then_an_accepted_upload(): void
    {
        $this->assertSame(['codex' => ['seq' => 0, 'appliedSeq' => 0, 'pending' => false, 'appliedAt' => null, 'origin' => null], 'claude' => ['seq' => 0, 'appliedSeq' => 0, 'pending' => false, 'appliedAt' => null, 'origin' => null]], $this->sync('get', '/')->assertOk()->json('logins'));
        $this->login(['seq' => 3])->assertOk()->assertJsonPath('ok', true)->assertJsonPath('logins.codex.seq', 3);
        $this->assertSame(['seq' => 3, 'appliedSeq' => 0, 'pending' => true, 'appliedAt' => null, 'origin' => null], $this->sync('get', '/')->json('logins.codex'));
        $this->assertCount(1, $this->files());
        $this->assertStringContainsString('/logins/', $this->files()[0]);
    }

    public function test_seq_must_exceed_the_last_accepted_one(): void
    {
        $this->login(['seq' => 2])->assertOk();
        $this->login(['seq' => 2])->assertStatus(409)->assertJsonPath('code', 'seq_conflict')->assertJsonPath('expected', 3);
        $this->login(['seq' => 1])->assertStatus(409)->assertJsonPath('code', 'seq_conflict');
        $this->assertCount(1, $this->files());
        $this->login(['seq' => 9])->assertOk();
        $this->assertSame(9, $this->sync('get', '/')->json('logins.codex.seq'));
    }

    public function test_a_wrong_sha_a_bad_query_and_an_empty_body_are_refused_and_leave_nothing(): void
    {
        $this->login(['sha256' => str_repeat('0', 64)])->assertStatus(422)->assertJsonPath('code', 'sha_mismatch');
        $this->login(['sha256' => 'nothex'])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->login(['seq' => 0])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->login([], '')->assertStatus(422);
        $this->assertSame([], $this->files());
        $this->assertSame(0, $this->sync('get', '/')->json('logins.codex.seq'));
        $this->raw('PUT', '/api/cloud-computer/sync/login/gemini?seq=1&sha256='.str_repeat('0', 64), 'x', 'cloud-test')->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->login(['origin' => 'mac'])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
    }

    public function test_the_size_cap_is_256_kib(): void
    {
        $this->login(['seq' => 1], str_repeat('A', 262144))->assertOk();
        $this->login(['seq' => 2], str_repeat('B', 262145))->assertStatus(413)->assertJsonPath('code', 'too_large');
        $this->assertCount(1, $this->files());
        $this->assertSame(1, $this->sync('get', '/')->json('logins.codex.seq'));
    }

    public function test_a_newer_upload_replaces_the_older_blob_at_once(): void
    {
        $this->login(['seq' => 1])->assertOk();
        $first = $this->files()[0];
        $this->login(['seq' => 2])->assertOk();
        $this->assertCount(1, $this->files());
        $this->assertNotSame($first, $this->files()[0]);
        $this->assertSame(1, DB::table('cloud_sync_logins')->count());
    }

    public function test_delete_removes_the_pending_blob_but_keeps_the_seq(): void
    {
        $this->login(['seq' => 4])->assertOk();
        $this->sync('delete', '/login/codex')->assertOk()->assertJsonPath('logins.codex.pending', false);
        $this->assertSame([], $this->files());
        $this->sync('delete', '/login/codex')->assertOk();
        $this->login(['seq' => 4])->assertStatus(409);
        $this->login(['seq' => 5])->assertOk();
        $this->sync('delete', '/login/gemini')->assertStatus(422);
    }

    public function test_accounts_never_see_or_replace_each_others_logins(): void
    {
        [$other, $token] = $this->otherAccount();
        $this->login(['seq' => 5])->assertOk();
        $this->login(['seq' => 1], null, $token)->assertOk();
        $this->assertSame(1, $this->sync('get', '/', [], $token)->json('logins.codex.seq'));
        $this->assertSame(5, $this->sync('get', '/')->json('logins.codex.seq'));
        $this->sync('delete', '/login/codex', [], $token)->assertOk();
        $this->assertTrue($this->sync('get', '/')->json('logins.codex.pending'));
        $this->assertCount(1, $this->files());
        $this->assertStringStartsWith($this->user->id.'/', $this->files()[0]);
    }

    public function test_it_needs_a_session_and_an_eligible_account(): void
    {
        $this->login([], null, 'wrong-token')->assertStatus(401);
        $this->withToken('')->deleteJson('/api/cloud-computer/sync/login/codex')->assertStatus(401);
        [$free, $token] = $this->otherAccount();
        DB::table('membership_periods')->where('user_id', $free->id)->delete();
        $this->login([], null, $token)->assertStatus(402)->assertJsonPath('code', 'not_eligible');
        $this->sync('delete', '/login/codex', [], $token)->assertStatus(402)->assertJsonPath('code', 'not_eligible');
        $this->assertSame(0, DB::table('cloud_sync_logins')->where('user_id', $free->id)->count());
        config(['cloud_workspaces.enabled' => false]);
        $this->login()->assertStatus(503)->assertJsonPath('code', 'not_eligible');
        $this->assertSame([], $this->files());
    }

    public function test_account_deletion_removes_the_login_blob_and_row_but_only_this_accounts(): void
    {
        [$other, $token] = $this->otherAccount();
        $this->login(['seq' => 1])->assertOk(); $this->login(['seq' => 1], 'FIXTURE-OTHER-ACCOUNT', $token)->assertOk();
        $this->assertCount(2, $this->files());
        app(AccountCleanup::class)->prepare($this->user->id);
        $this->assertCount(1, $this->files());
        $this->assertStringStartsWith($other->id.'/', $this->files()[0]);
        $this->assertSame(0, DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->count());
        $this->assertSame(1, DB::table('cloud_sync_logins')->where('user_id', $other->id)->count());
    }

    public function test_uploads_are_rate_limited(): void
    {
        for ($i = 1; $i <= 30; $i++) $this->login(['seq' => $i])->assertOk();
        $this->login(['seq' => 31])->assertStatus(429);
    }

    public function test_stale_login_cleanup_cannot_clear_a_newer_upload(): void
    {
        $this->login(['seq' => 1])->assertOk();
        $old = DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->first();
        $this->login(['seq' => 2])->assertOk();
        (new \ReflectionMethod(\App\Services\CloudComputer\SyncLogins::class, 'dropBlob'))
            ->invoke(app(\App\Services\CloudComputer\SyncLogins::class), $old, ['applied_seq' => 1]);
        $current = DB::table('cloud_sync_logins')->where('id', $old->id)->first();
        $this->assertSame(2, (int) $current->seq);
        $this->assertNotNull($current->blob_id);
        $this->assertSame(0, (int) $current->applied_seq);
        Storage::disk('cloud-sync')->assertExists($current->path);
    }

}
