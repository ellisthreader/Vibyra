<?php

namespace Tests\Feature;

use App\Models\AgentV2\{ApprovalRule, Grant, Run, ToolAction};
use App\Services\AgentRuns\Jobs\AccountLock;
use App\Services\AgentRuns\Rules\{RuleApproval, RuleEligibility, Rules};
use App\Services\AgentRuns\Tools\Approvals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentDepthFixture, AgentDepthRulesSetup, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class AgentStandingRuleBoundsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture, AgentDepthRulesSetup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRules();
    }

    public function test_a_reserved_use_is_spent_once_and_a_retry_cannot_reset_the_budget(): void
    {
        $id = $this->rule(['maxUses' => 1])->assertOk()->json('rule.id');
        $this->admit('Go.');
        $claim = $this->claim();
        $action = $this->issue($claim, 'one')->assertJsonPath('action.state', 'completed')->json('action.id');
        $this->issue($claim, 'one')->assertJsonPath('action.id', $action)->assertJsonPath('action.state', 'completed');
        $this->issue($claim, 'two')->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(1, $this->sent('POST', self::ISSUES));
        $this->rule(['maxUses' => 100, 'expectedRevision' => 0])->assertStatus(409)->assertJsonPath('code', 'rule_changed');
        $rule = ApprovalRule::query()->findOrFail($id);
        $this->assertSame([1, 1, 1], [$rule->revision, $rule->use_count, $rule->max_uses]);
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules')->assertJsonPath('rules.0.remainingUses', 0);
    }

    private function approvedButUnsent(): array
    {
        $id = $this->rule(['maxUses' => 1])->assertOk()->json('rule.id');
        app(Rules::class)->pause($this->user->id, true);
        $this->admit('Go.');
        $pending = $this->issue($this->claim(), 'one')->assertJsonPath('action.state', 'pending_approval')->json('action.id');
        app(Rules::class)->pause($this->user->id, false);
        DB::transaction(function () use ($pending) {
            AccountLock::force($this->user->id);
            $action = ToolAction::query()->findOrFail($pending);
            $this->assertTrue(app(RuleApproval::class)->preapprove($action, Run::query()->findOrFail($action->run_id)));
        });
        return [$id, $pending];
    }

    public function test_revoking_and_replacing_a_rule_never_revives_its_previous_approval(): void
    {
        [$id, $action] = $this->approvedButUnsent();
        app(Rules::class)->revoke($this->user->id, $this->agent['id'], $id);
        $replacement = $this->rule([])->assertOk()->json('rule.id');
        $this->assertNotSame($id, $replacement);
        app(Approvals::class)->dispatch($action);
        $this->assertSame('refused', ToolAction::query()->findOrFail($action)->state);
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_changing_the_rule_revision_stops_an_already_approved_write(): void
    {
        [, $action] = $this->approvedButUnsent();
        $this->rule(['maxUses' => 20])->assertOk()->assertJsonPath('rule.revision', 2);
        app(Approvals::class)->dispatch($action);
        $this->assertSame('refused', ToolAction::query()->findOrFail($action)->state);
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_missing_context_cannot_dispatch_a_private_rule_approval(): void
    {
        [, $action] = $this->approvedButUnsent();
        $runId = ToolAction::query()->findOrFail($action)->run_id;
        \App\Models\AgentV2\Job::query()->where('run_id', $runId)->delete();
        app(Approvals::class)->dispatch($action);
        $this->assertSame('refused', ToolAction::query()->findOrFail($action)->state);
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_new_grant_authority_requires_new_rule_review(): void
    {
        $this->rule([])->assertOk();
        Grant::query()->where('agent_id', $this->agent['id'])->where('connection_id', $this->github)->increment('revision');
        $this->admit('Go.');
        $this->issue($this->claim(), 'one')->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }

    public function test_resource_scope_and_budgets_are_explicit_and_case_sensitive_where_required(): void
    {
        $this->rule(['scope' => ''])->assertStatus(422)->assertJsonPath('code', 'rule_scope_required');
        foreach ([0, 101] as $max) $this->rule(['maxUses' => $max])->assertStatus(422);
        $this->assertSame('File/Report.md', RuleEligibility::scopeOf('workspace_edit', ['path' => 'File/Report.md']));
        $this->assertSame('AbC', RuleEligibility::scopeOf('google_tasks_create', ['listId' => 'AbC']));
        $this->assertSame('qa-org/sandbox', RuleEligibility::scopeOf('github_create_issue', ['repository' => 'QA-Org/Sandbox']));
    }

    public function test_secret_payloads_need_a_person_even_if_the_optional_guard_flag_is_off(): void
    {
        config(['agent_depth.secret_guard' => false]);
        $this->rule([])->assertOk();
        $this->admit('Go.');
        $this->issue($this->claim(), 'one', 'qa-org/sandbox', 'token ghp_k3Jq8ZxV2mNw7RbT4YcD1sHjL6GpUa0EoI5t')
            ->assertJsonPath('action.state', 'pending_approval');
        $this->assertSame(0, $this->sent('POST', self::ISSUES));
    }
}
