<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\Drafts\Drafts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

final class AgentStageTwoDraftsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void { parent::setUp(); $this->bootV2(); }

    private function prepare(): array
    {
        $connection = $this->gmailInstall('sender@example.com');
        $this->grant($connection, ['gmail_send']);
        $this->admit('Prepare an email.');
        $run = $this->claim();
        $args = ['to' => 'first@example.com', 'subject' => 'First', 'body' => 'Original body'];
        $action = $this->callTool($run, 'gmail_send', $connection, $args, 'draft-call')->assertOk()->json('action');
        $draft = $this->getJson('/api/agents/v2/actions/'.$action['id'].'/draft')->assertOk()->json('draft');
        return [$run, $connection, $args, $draft];
    }

    private function edit(array $draft, array $args)
    {
        return $this->patchJson('/api/agents/v2/actions/'.$draft['id'].'/draft', [
            'revision' => $draft['revision'], 'fingerprint' => $draft['fingerprint'], 'arguments' => $args]);
    }

    private function decide(array $draft, string $decision = 'allow')
    {
        return $this->postJson('/api/agents/v2/actions/'.$draft['id'].'/decision', [
            'fingerprint' => $draft['fingerprint'], 'decision' => $decision]);
    }

    public function test_edit_is_revision_bound_replay_safe_and_sends_only_displayed_fields_once(): void
    {
        [$run, $connection, $args, $first] = $this->prepare();
        $this->assertSame('sender@example.com', $first['account']);
        $this->assertSame(['from', 'to', 'subject', 'body', 'attachments'], $first['editableFields']);
        $changed = ['to' => 'second@example.com', 'subject' => 'Reviewed', 'body' => 'Reviewed body'];
        $second = $this->edit($first, $changed)->assertOk()->json('draft');
        $this->assertSame(2, $second['revision']);
        $this->assertNotSame($first['fingerprint'], $second['fingerprint']);
        $this->edit($first, $args)->assertStatus(409)->assertJsonPath('code', 'stale_draft');
        $this->decide($first)->assertStatus(409)->assertJsonPath('code', 'stale_fingerprint');
        $this->callTool($run, 'gmail_send', $connection, $args, 'draft-call')->assertOk()->assertJsonPath('action.id', $first['id']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->decide($second)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->decide($second)->assertOk();
        $sends = Http::recorded(fn ($request) => str_contains($request->url(), '/messages/send'));
        $this->assertCount(1, $sends);
        $mime = base64_decode(strtr($sends[0][0]['raw'], '-_', '+/'));
        $this->assertStringContainsString('To: second@example.com', $mime);
        $this->assertStringContainsString(base64_encode('Reviewed body'), $mime);
        $this->edit($second, $args)->assertStatus(409)->assertJsonPath('code', 'draft_closed');
        $this->assertDatabaseCount('agent_draft_revisions', 2);
    }

    public function test_reverting_content_never_restores_an_old_fingerprint_and_discard_cannot_dispatch(): void
    {
        [, , $args, $first] = $this->prepare();
        $second = $this->edit($first, [...$args, 'body' => 'Changed'])->assertOk()->json('draft');
        $third = $this->edit($second, $args)->assertOk()->json('draft');
        $this->assertNotSame($first['fingerprint'], $third['fingerprint']);
        $this->decide($first)->assertStatus(409);
        $this->decide($third, 'decline')->assertOk()->assertJsonPath('action.state', 'declined');
        $this->decide($third)->assertStatus(409);
        $this->edit($third, $args)->assertStatus(409);
        Http::assertNothingSent();
    }

    public function test_unknown_receipt_cannot_be_edited_or_replayed_as_another_send(): void
    {
        [$run, $connection, $args, $draft] = $this->prepare();
        Http::fake(['gmail.googleapis.com/*' => Http::response([], 200)]);
        $this->decide($draft)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->decide($draft)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->edit($draft, [...$args, 'body' => 'Try again'])->assertStatus(409);
        $this->callTool($run, 'gmail_send', $connection, $args, 'another-call')->assertOk()
            ->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->assertCount(1, Http::recorded(fn ($r) => str_contains($r->url(), '/messages/send')));
    }

    public function test_draft_owner_fixed_sender_attachments_and_revoked_account_are_enforced(): void
    {
        [, , $args, $draft] = $this->prepare();
        $this->edit($draft, [...$args, 'from' => 'spoof@example.com'])->assertStatus(422);
        $this->edit($draft, [...$args, 'attachments' => []])->assertStatus(422);
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        app(Drafts::class)->find($this->user->id + 100, $draft['id']);
    }

    public function test_access_change_and_cancelled_or_expired_drafts_refuse_edits(): void
    {
        [, $connection, $args, $draft] = $this->prepare();
        DB::table('agent_grants')->where('connection_id', $connection)->increment('revision');
        $this->edit($draft, [...$args, 'body' => 'Changed'])->assertStatus(409)->assertJsonPath('code', 'draft_access_changed');
        ToolAction::query()->whereKey($draft['id'])->update(['expires_at' => now()->subMinute()]);
        $this->edit($draft, $args)->assertStatus(409)->assertJsonPath('code', 'approval_expired');
        ToolAction::query()->whereKey($draft['id'])->update(['state' => 'cancelled']);
        $this->edit($draft, $args)->assertStatus(409)->assertJsonPath('code', 'draft_closed');
        Http::assertNothingSent();
    }
}
