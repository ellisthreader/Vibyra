<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\Rules\RuleApproval;
use App\Services\AgentRuns\Tools\Approvals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentDepthFixture, AgentDepthRulesSetup, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: what stops a rule: the master switch, a rule gone before dispatch, a stronger "ask", a secret in the payload, ownership and the flag. */
class AgentDepthRulesGuardsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture, AgentDepthRulesSetup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRules();
    }

    public function test_the_master_switch_stops_every_rule_and_back_on_restores_them(): void
    {
        $this->rule([])->assertOk();
        $this->getJson('/api/agents/v2/rules/status')->assertOk()->assertJsonPath('enabled', true)->assertJsonPath('paused', false);
        $this->postJson('/api/agents/v2/rules/kill-switch', ['paused' => true])->assertOk()->assertJsonPath('paused', true);
        $this->admit('Go.');
        $claimed = $this->claim();
        $this->issue($claimed, 'paused')->assertJsonPath('action.state', 'pending_approval');
        $this->postJson('/api/agents/v2/rules/kill-switch', ['paused' => false])->assertOk();
        $this->decide(['id' => ToolAction::query()->where('call_id', 'paused')->value('id')])->assertOk(); // finish this one the usual way
        $this->assertSame('completed', ToolAction::query()->where('call_id', 'paused')->value('state'));
    }

    public function test_a_rule_that_stops_applying_before_the_action_runs_refuses_it(): void
    {
        $id = $this->rule([])->assertOk()->json('rule.id');
        $this->admit('Go.');
        $claimed = $this->claim();
        $pending = $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/tools'), [...['generation' => $claimed['generation']], 'callId' => 'x', 'tool' => 'github_comment_issue',
            'connectionId' => $this->github, 'schemaRevision' => app(\App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('github_comment_issue'),
            'arguments' => ['repository' => 'qa-org/sandbox', 'number' => 3, 'body' => 'hi']], $this->runnerHeaders())->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        // Pretend it had been approved by the rule, which is then revoked before dispatch.
        ToolAction::query()->whereKey($pending['id'])->update(['state' => 'approved', 'decision' => 'allow', 'approved_by' => 'rule', 'rule_id' => $id]);
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules/'.$id)->assertOk();
        $action = ToolAction::query()->findOrFail($pending['id']);
        $this->assertTrue(app(RuleApproval::class)->stale($action, Run::query()->findOrFail($action->run_id)));
        $this->assertSame('refused', (function () use ($pending) { app(Approvals::class)->dispatch($pending['id']); return ToolAction::query()->find($pending['id'])->state; })());
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/comments'));
    }

    public function test_always_ask_wins_over_a_broader_allow(): void
    {
        $this->rule([])->assertOk();
        $this->rule(['scope' => 'qa-org/sandbox', 'effect' => 'ask'])->assertOk();
        $this->admit('Go.');
        $claimed = $this->claim();
        $this->issue($claimed, 'a1')->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_a_payload_with_a_secret_is_never_pre_approved(): void
    {
        $this->depth(['secret_guard']);
        $this->rule([])->assertOk();
        $this->admit('Go.');
        $claimed = $this->claim();
        $this->issue($claimed, 's1', 'qa-org/sandbox', 'key ghp_k3Jq8ZxV2mNw7RbT4YcD1sHjL6GpUa0EoI5t')->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_rules_belong_to_their_owner_and_off_means_not_available(): void
    {
        $id = $this->rule([])->assertOk()->json('rule.id');
        $this->assertSame($id, $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules')->json('rules.0.id'));
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules/'.$id)->assertOk();
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules/'.$id)->assertStatus(404)->assertJsonPath('code', 'rule_not_found');
        config(['agent_depth.rules' => false]);
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules')->assertStatus(404)->assertJsonPath('code', 'not_available');
        $this->getJson('/api/agents/v2/rules/status')->assertOk()->assertJsonPath('enabled', false);
        $this->postJson('/api/agents/v2/rules/kill-switch', ['paused' => true])->assertStatus(404);
    }

    public function test_with_rules_off_a_stored_rule_does_nothing(): void
    {
        $this->rule([])->assertOk();
        config(['agent_depth.rules' => false]);
        $this->admit('Go.');
        $this->issue($this->claim(), 'off')->assertJsonPath('action.state', 'pending_approval');
    }
}
