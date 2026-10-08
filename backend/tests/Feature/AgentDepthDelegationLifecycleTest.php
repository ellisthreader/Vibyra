<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Delegation\Delegation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentDepthDelegationSetup, AgentDepthFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: how a delegation ends: cancelled parent, ended parent, a busy runner asking for delegated runs, a masked task, the audit row. */
class AgentDepthDelegationLifecycleTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture, AgentDepthDelegationSetup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpDelegation();
    }

    public function test_cancelling_the_parent_stops_its_delegate(): void
    {
        $this->start();
        $a = $this->delegate($this->claimed, 'Calendar', 'Slow job', 'd1')->assertOk()->json('action');
        $childId = DB::table('agent_runs')->where('parent_run_id', $this->parent['id'])->value('id');
        $this->postJson('/api/agents/v2/runs/'.$this->parent['id'].'/cancel')->assertOk()->assertJsonPath('run.state', 'cancelled');
        $this->assertSame('cancelled', DB::table('agent_runs')->where('id', $childId)->value('state'));
        $this->assertSame('cancelled', DB::table('agent_tool_actions')->where('id', $a['id'])->value('state'));
    }

    public function test_a_delegate_whose_parent_already_ended_is_stopped_instead_of_run(): void
    {
        $this->start();
        $this->delegate($this->claimed, 'Calendar', 'Slow job', 'd1')->assertOk();
        $childId = DB::table('agent_runs')->where('parent_run_id', $this->parent['id'])->value('id');
        $this->failRun($this->claimed)->assertOk()->assertJsonPath('run.state', 'failed');
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->assertSame('cancelled', DB::table('agent_runs')->where('id', $childId)->value('state'));
    }

    public function test_a_busy_runner_can_ask_for_delegated_runs_only(): void
    {
        $this->start();
        $other = $this->admit('A later task of its own.');
        $this->delegate($this->claimed, 'Calendar', 'Work', 'd1')->assertOk();
        $got = $this->postJson($this->runnerPath('/claim'), ['delegatedOnly' => true], $this->runnerHeaders())->assertOk()->json('run');
        $this->assertSame($this->calendar['id'], $got['agentId']);
        $this->postJson($this->runnerPath('/claim'), ['delegatedOnly' => true], $this->runnerHeaders())->assertNoContent();
        $this->assertSame('queued', $this->runState($other['id']));
    }

    public function test_the_task_text_is_masked_when_the_secret_guard_is_on(): void
    {
        $this->depth(['secret_guard']);
        $this->start();
        $this->delegate($this->claimed, 'Calendar', 'Use ghp_k3Jq8ZxV2mNw7RbT4YcD1sHjL6GpUa0EoI5t to list repos', 'd1')->assertOk();
        $child = DB::table('agent_runs')->where('parent_run_id', $this->parent['id'])->sole();
        $this->assertStringNotContainsString('ghp_', $child->prompt);
        $this->assertStringContainsString('[redacted:github_token]', $child->prompt);
        $this->assertSame(Delegation::TOOL, DB::table('agent_tool_actions')->where('run_id', $this->parent['id'])->value('tool'));
    }

    public function test_starting_a_delegation_is_written_to_the_activity_log(): void
    {
        $this->start();
        $this->delegate($this->claimed, 'Calendar', 'Work', 'd1')->assertOk();
        $row = DB::table('account_audit_events')->where('user_id', $this->user->id)->where('event', 'delegation.started')->sole();
        $this->assertSame('system', $row->actor);
        $detail = json_decode($row->detail, true);
        $this->assertSame(['Inbox', 'Calendar', 1], [$detail['from'], $detail['to'], $detail['depth']]);
    }
}
