<?php

namespace Tests\Feature;

use App\Models\AgentV2\{ApprovalRule, Run, ToolAction};
use App\Services\AgentRuns\Rules\{RuleApproval, RuleEligibility};
use App\Services\AgentRuns\Tools\Approvals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentDepthFixture, AgentDepthRulesSetup, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: standing approval rules: bounded tools only, never irreversible, expiry, kill switch, scope, audit and the receipt (fixtures). */
class AgentDepthRulesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture, AgentDepthRulesSetup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRules();
    }

    public function test_the_editor_lists_what_a_rule_could_cover_and_nothing_irreversible(): void
    {
        $view = $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules')->assertOk()->assertJsonPath('paused', false)->json();
        $this->assertEqualsCanonicalizing(['github_create_issue', 'github_comment_issue'], array_column($view['eligible'], 'tool'));
        $this->assertNotContains('gmail_send', array_column($view['eligible'], 'tool'));
        $this->assertSame([], $view['rules']);
    }

    public function test_an_allow_rule_pre_approves_one_exact_action_and_the_receipt_says_so(): void
    {
        $created = $this->rule(['scope' => 'QA-Org/Sandbox'])->assertOk()->assertJsonPath('rule.effect', 'allow')->assertJsonPath('rule.scope', 'qa-org/sandbox')->json('rule');
        $this->assertEqualsWithDelta(30 * 86400, strtotime($created['expiresAt']) - time(), 5, 'Default life is 30 days.');
        $run = $this->admit('Open the sync issue.');
        $claimed = $this->claim();
        $done = $this->issue($claimed, 'w1')->assertJsonPath('action.state', 'completed')->json('action');
        $this->assertSame(1, $this->sent('POST', self::ISSUES));
        $this->assertStringContainsString('allowed by rule '.substr($created['id'], 0, 8), $done['receipt']['status'] === 'confirmed'
            ? (string) DB::table('agent_receipts')->where('action_id', $done['id'])->value('summary') : '');
        $row = ToolAction::query()->findOrFail($done['id']);
        $this->assertSame(['rule', $created['id'], 'completed'], [$row->approved_by, $row->rule_id, $row->state]);
        $this->assertSame(64, strlen((string) $row->fingerprint), 'The fingerprint machinery still runs.');
        $this->assertTrue(hash_equals($row->fingerprint, Approvals::fingerprint($row, $this->user->id)));
        $card = $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.actions.0');
        $this->assertSame(['source' => 'rule', 'ruleId' => $created['id']], $card['approval']);
        $this->assertNotContains('run.waiting_approval', DB::table('agent_run_events')->where('run_id', $run['id'])->pluck('type')->all(), 'Nobody was asked.');
        $decided = collect(DB::table('agent_run_events')->where('run_id', $run['id'])->where('type', 'approval.decided')->get())->map(fn ($e) => json_decode($e->payload, true))->sole();
        $this->assertSame(['allow', 'rule', $created['id']], [$decided['decision'], $decided['source'], $decided['ruleId']]);
        $this->assertSame(1, ApprovalRule::query()->find($created['id'])->use_count);
        $this->assertSame('running', $this->runState($run['id']));
    }

    public function test_creating_changing_using_and_removing_a_rule_is_written_to_the_activity_log(): void
    {
        $id = $this->rule([])->assertOk()->json('rule.id');
        $this->rule(['expiresInDays' => 7])->assertOk()->assertJsonPath('rule.id', $id);
        $this->admit('Go.');
        $this->issue($this->claim(), 'w1')->assertJsonPath('action.state', 'completed');
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules/'.$id)->assertOk();
        $this->postJson('/api/agents/v2/rules/kill-switch', ['paused' => true])->assertOk();
        $events = DB::table('account_audit_events')->where('user_id', $this->user->id)->whereIn('event', ['rule.created', 'rule.changed', 'rule.used', 'rule.revoked', 'rule.kill_switch'])
            ->orderBy('id')->pluck('event')->all();
        $this->assertSame(['rule.created', 'rule.changed', 'rule.used', 'rule.revoked', 'rule.kill_switch'], $events);
        $this->assertStringNotContainsString('gh-token', json_encode(DB::table('account_audit_events')->get()->all()));
    }

    public function test_an_irreversible_action_can_never_be_made_automatic(): void
    {
        foreach (['gmail_send' => $this->gmail, 'slack_post_message' => $this->gmail, 'browser_submit' => $this->gmail, 'publish_branch' => $this->gmail] as $tool => $connection)
            $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules', ['tool' => $tool, 'connectionId' => $connection, 'effect' => 'allow'])
                ->assertStatus(422)->assertJsonPath('code', 'rule_not_allowed');
        $this->assertSame(0, ApprovalRule::query()->count());
        // Even a rule written straight into the table is ignored when the action runs, and "always ask" is fine for any write.
        ApprovalRule::query()->create(['user_id' => $this->user->id, 'agent_id' => $this->agent['id'], 'tool' => 'gmail_send', 'connection_id' => $this->gmail,
            'scope' => '', 'effect' => 'allow', 'expires_at' => now()->addDay()]);
        $this->admit('Mail it.');
        $claimed = $this->claim();
        $this->callTool($claimed, 'gmail_send', $this->gmail, ['to' => 'a@example.com', 'subject' => 'Hi', 'body' => 'x'], 'm1')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval');
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/messages/send'));
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules', ['tool' => 'gmail_send', 'connectionId' => $this->gmail, 'effect' => 'ask'])->assertOk();
        foreach (['github_create_issue', 'workspace_edit', 'notion_create_page'] as $tool) $this->assertTrue(RuleEligibility::allowed($tool));
        foreach (['gmail_send', 'slack_post_message', 'teams_post_message', 'outlook_mail_send', 'browser_submit', 'publish_branch', 'open_draft_pr', 'run_test',
            'github_delete_branch', 'stripe_refund', 'mcp_00000000__send_all', 'composio_gmail__send', 'google_drive_trash'] as $tool) $this->assertFalse(RuleEligibility::allowed($tool), $tool);
    }

    public function test_a_rule_is_checked_for_its_exact_tool_connection_and_scope(): void
    {
        $this->rule(['scope' => 'qa-org/sandbox'])->assertOk();
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules', ['tool' => 'github_create_issue', 'connectionId' => $this->gmail, 'effect' => 'allow'])
            ->assertStatus(422)->assertJsonPath('code', 'rule_not_granted');
        $this->rule(['tool' => 'github_comment_issue', 'scope' => 'x/y'])->assertOk();
        $this->admit('Go.');
        $claimed = $this->claim();
        $this->issue($claimed, 'other-repo', 'qa-org/other')->assertJsonPath('action.state', 'pending_approval');
        $this->decide($this->getJson('/api/agents/v2/runs/'.DB::table('agent_runs')->value('id'))->json('run.actions.0'))->assertOk();
    }

    public function test_a_scope_on_a_tool_without_one_and_a_read_are_refused(): void
    {
        $this->rule(['tool' => 'github_create_issue', 'scope' => str_repeat('a', 201)])->assertStatus(422);
        $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules', ['tool' => 'gmail_read', 'connectionId' => $this->gmail, 'effect' => 'ask'])
            ->assertStatus(422)->assertJsonPath('code', 'rule_not_allowed');
    }

    public function test_an_expired_rule_sends_the_action_to_the_person_and_shows_as_expired(): void
    {
        $this->rule(['expiresInDays' => 400])->assertStatus(422);
        $id = $this->rule(['expiresInDays' => 365])->assertOk()->json('rule.id');
        $this->assertEqualsWithDelta(365 * 86400, ApprovalRule::query()->find($id)->expires_at->timestamp - time(), 5, 'The longest life is a year.');
        ApprovalRule::query()->whereKey($id)->update(['expires_at' => now()->subMinute()]);
        $this->admit('Go.');
        $this->issue($this->claim(), 'late')->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
        $this->assertTrue($this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules')->json('rules.0.expired'));
    }
}
