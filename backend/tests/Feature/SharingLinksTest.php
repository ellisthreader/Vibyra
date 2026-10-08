<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{SharingFixture, SharingLinkHelpers};
use Tests\TestCase;

/** Part 17: public share links (unguessable, hashed, expiring, revocable, a snapshot of exactly what was previewed). */
class SharingLinksTest extends TestCase
{
    use RefreshDatabase, SharingFixture, SharingLinkHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootLinks();
    }

    public function test_it_is_off_by_default_and_a_live_link_dies_with_the_flag(): void
    {
        [, $token] = $this->share();
        config(['sharing.links' => false]);
        $this->preview()->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->getJson('/api/sharing/links')->assertNotFound();
        $this->page($token)->assertNotFound();
        config(['sharing.links' => true]);
        $this->page($token)->assertOk();
    }

    public function test_the_preview_is_exactly_what_will_be_public_and_stores_nothing(): void
    {
        $p = $this->preview()->assertOk()->json('preview');
        $this->assertSame(['conversation', 'Reviewer · conversation', 7, 30, 0, 20], [$p['kind'], $p['title'], $p['defaultDays'], $p['maxDays'], $p['active'], $p['limit']]);
        $this->assertSame(['you', 'teammate'], array_column($p['snapshot']['messages'], 'role'));
        $this->assertSame(['Please review the login change.', 'Looks fine. One nit on naming.'], array_column($p['snapshot']['messages'], 'text'));
        $this->assertSame(hash('sha256', json_encode($p['snapshot'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), $p['snapshotHash']);
        $this->assertSame(0, DB::table('shared_links')->count());
        $keys = array_keys($p['snapshot']['messages'][0]);
        sort($keys);
        $this->assertSame(['at', 'role', 'text'], $keys, 'No ids, tool results or attachments in what is shared.');
    }

    public function test_publishing_needs_an_explicit_confirm_and_the_previewed_hash(): void
    {
        $hash = $this->preview()->json('preview.snapshotHash');
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash])->assertUnprocessable();
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash, 'confirm' => false])->assertUnprocessable();
        $this->postJson('/api/sharing/links', [...$this->source(), 'confirm' => true])->assertUnprocessable();
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => str_repeat('0', 64), 'confirm' => true])->assertStatus(409)->assertJsonPath('code', 'preview_changed');
        $this->assertSame(0, DB::table('shared_links')->count());
        // Something new lands after the preview: the person must look again.
        $this->finishedRun($this->agent, 'And the signup change?', 'Same story.');
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash, 'confirm' => true])->assertStatus(409);
        $this->assertSame(0, DB::table('shared_links')->count());
    }

    public function test_the_token_is_32_random_bytes_shown_once_and_only_its_hash_is_stored(): void
    {
        [$r, $token] = $this->share();
        $r->assertCreated();
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $token);
        $this->assertSame(32, strlen(base64_decode(strtr($token, '-_', '+/').'=')), '256 bits of entropy');
        $this->assertSame(url('/s/'.$token), $r->json('url'));
        $row = DB::table('shared_links')->first();
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertStringNotContainsString($token, json_encode((array) $row));
        $this->assertStringNotContainsString($token, json_encode(DB::table('account_audit_events')->get()));
        $this->assertStringNotContainsString($token, json_encode($r->json('link')));
        $this->assertStringNotContainsString($token, $this->getJson('/api/sharing/links')->assertOk()->getContent());
        [, $second] = $this->share();
        $this->assertNotSame($token, $second);
        $this->assertSame(2, DB::table('shared_links')->distinct()->count('token_hash'));
    }

    public function test_the_default_life_is_seven_days_and_it_can_be_shorter_but_never_longer_than_thirty(): void
    {
        $this->travelTo(now()->startOfSecond());
        [$r, $token] = $this->share();
        $this->assertSame(now()->addDays(7)->toIso8601String(), $r->json('link.expiresAt'));
        $this->travel(7)->days();
        $this->travel(-1)->seconds();
        $this->page($token)->assertOk();
        $this->travel(2)->seconds();
        $this->page($token)->assertNotFound();
        $this->assertSame([], $this->getJson('/api/sharing/links')->json('links'));
        [$short] = $this->share([], ['days' => 1]);
        $this->assertSame(now()->addDay()->toIso8601String(), $short->json('link.expiresAt'));
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $this->preview()->json('preview.snapshotHash'), 'confirm' => true, 'days' => 31])->assertUnprocessable();
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $this->preview()->json('preview.snapshotHash'), 'confirm' => true, 'days' => 0])->assertUnprocessable();
    }

    public function test_revoking_ends_the_link_at_once_and_is_repeatable(): void
    {
        [$r, $token] = $this->share();
        $id = $r->json('link.id');
        $this->page($token)->assertOk();
        $this->deleteJson('/api/sharing/links/'.$id)->assertOk();
        $this->page($token)->assertNotFound();
        $this->deleteJson('/api/sharing/links/'.$id)->assertOk();
        $this->assertSame([], $this->getJson('/api/sharing/links')->json('links'));
        $this->assertSame(['share.created', 'share.revoked'], AccountAuditEvent::orderBy('id')->pluck('event')->all());
    }

    public function test_one_account_cannot_see_preview_or_revoke_anothers(): void
    {
        [$r, $token] = $this->share();
        $this->signedIn('other-session');
        $this->deleteJson('/api/sharing/links/'.$r->json('link.id'))->assertNotFound();
        $this->getJson('/api/sharing/links')->assertOk()->assertJsonCount(0, 'links');
        $this->preview()->assertNotFound();
        $this->postJson('/api/sharing/links/preview', ['kind' => 'conversation', 'agentId' => $this->agent['id'], 'runId' => (string) Str::uuid()])->assertNotFound();
        $this->page($token)->assertOk();
        $this->assertNull(DB::table('shared_links')->value('revoked_at'));
        $this->withToken('')->getJson('/api/sharing/links')->assertUnauthorized();
        $this->postJson('/api/sharing/links/preview', $this->source())->assertUnauthorized();
    }

    public function test_the_snapshot_is_taken_at_creation_and_shows_no_live_data(): void
    {
        [, $token] = $this->share();
        $this->finishedRun($this->agent, 'A later question.', 'A later answer.');
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['name' => 'Renamed']);
        DB::table('agent_runs')->where('agent_id', $this->agent['id'])->update(['answer' => 'Edited afterwards.']);
        $html = $this->page($token)->assertOk()->getContent();
        $this->assertStringNotContainsString('later', $html);
        $this->assertStringNotContainsString('Renamed', $html);
        $this->assertStringNotContainsString('Edited afterwards', $html);
        $this->assertStringContainsString('Looks fine. One nit on naming.', $html);
    }

    public function test_a_conversation_holds_finished_runs_only_and_the_newest_twenty(): void
    {
        $fresh = $this->teammate('Fresh');
        $this->preview(['agentId' => $fresh['id']])->assertUnprocessable()->assertJsonPath('code', 'nothing_to_share');
        $this->finishedRun($fresh, 'Still going', null, 'running');
        $this->finishedRun($fresh, 'Cancelled one', null, 'cancelled');
        $messages = $this->preview(['agentId' => $fresh['id']])->assertOk()->json('preview.snapshot.messages');
        $this->assertSame(['Cancelled one'], array_column($messages, 'text'));
        for ($i = 1; $i <= 25; $i++) $this->finishedRun($fresh, 'Q'.$i, 'A'.$i);
        $messages = $this->preview(['agentId' => $fresh['id']])->assertOk()->json('preview.snapshot.messages');
        $this->assertCount(40, $messages);
        $this->assertSame(['Q6', 'A6'], [$messages[0]['text'], $messages[1]['text']]);
        $this->assertSame('A25', $messages[39]['text']);
        $one = $this->finishedRun($fresh, 'Only this', 'Just this answer');
        $this->assertSame(['Only this', 'Just this answer'], array_column($this->preview(['agentId' => $fresh['id'], 'runId' => $one])->json('preview.snapshot.messages'), 'text'));
        $this->preview(['agentId' => $this->agent['id'], 'runId' => $one])->assertUnprocessable()->assertJsonPath('code', 'run_not_shareable');
    }

    public function test_a_diff_can_be_shared_and_is_redacted_and_bounded(): void
    {
        $diff = "diff --git a/a.php b/a.php\n--- a/a.php\n+++ b/a.php\n@@ -1,2 +1,2 @@\n-old line\n+new line\n+\$key = '".self::KEY."';\n";
        [$r, $token] = $this->share(['kind' => 'diff', 'text' => $diff, 'title' => 'Fix the login bug'], ['days' => 3]);
        $r->assertCreated();
        $this->assertSame('diff', $r->json('link.kind'));
        $html = $this->page($token)->assertOk()->getContent();
        $this->assertStringContainsString('Fix the login bug', $html);
        $this->assertStringContainsString('class="add"', $html);
        $this->assertStringContainsString('class="del"', $html);
        $this->assertStringContainsString('class="hunk"', $html);
        $this->assertStringNotContainsString(self::KEY, $html);
        $this->preview(['kind' => 'diff', 'text' => str_repeat('x', 90001)])->assertUnprocessable()->assertJsonPath('code', 'share_too_large');
        $this->preview(['kind' => 'diff', 'text' => '   '])->assertUnprocessable();
        $this->preview(['kind' => 'diff'])->assertUnprocessable();
        $this->preview(['kind' => 'notes', 'text' => 'x'])->assertUnprocessable();
        $this->assertSame('Diff', $this->preview(['kind' => 'diff', 'text' => '+x'])->json('preview.title'));
    }

    public function test_a_snapshot_over_the_size_cap_is_refused(): void
    {
        config(['sharing.link_max_bytes' => 500]);
        $this->finishedRun($this->agent, str_repeat('long ', 200), 'ok');
        $this->preview()->assertUnprocessable()->assertJsonPath('code', 'share_too_large');
    }
}
