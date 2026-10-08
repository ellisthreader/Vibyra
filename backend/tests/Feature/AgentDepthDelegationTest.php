<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Delegation\Delegation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentDepthDelegationSetup, AgentDepthFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: `delegate_task`: depth, cap, cycles, grant isolation, the parent's wait, the thread marker and time (fixtures only). */
class AgentDepthDelegationTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture, AgentDepthDelegationSetup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpDelegation();
    }

    public function test_the_tool_is_offered_only_while_the_flag_is_on_and_a_teammate_could_take_it(): void
    {
        $this->start();
        $tool = collect($this->claimed['tools']['tools'])->firstWhere('tool', 'delegate_task');
        $this->assertSame($this->parent['id'], $tool['connectionId']);
        $this->assertSame('delegation', $tool['provider']);
        $this->assertLessThanOrEqual(10, count($this->claimed['tools']['tools']));
        config(['agent_depth.delegation' => false]);
        $this->assertNull(collect($this->getJson('/api/agents/v2/runs/'.$this->parent['id'].'/tools')->json('manifest.tools'))->firstWhere('tool', 'delegate_task'));
        $this->delegate($this->claimed, 'Calendar', 'List repos', 'd-off')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'unknown_tool');
        $this->assertSame(0, DB::table('agent_runs')->whereNotNull('parent_run_id')->count());
    }

    public function test_a_delegated_task_is_a_child_run_with_only_the_childs_grants_and_the_parent_waits_for_its_answer(): void
    {
        $this->start();
        $a = $this->delegate($this->claimed, 'calendar', 'List the repositories you can see.', 'd1')->assertOk()
            ->assertJsonPath('action.state', 'dispatching')->assertJsonPath('action.summary', 'Delegated to Calendar')->json('action');
        $child = DB::table('agent_runs')->where('parent_run_id', $this->parent['id'])->sole();
        $this->assertSame($this->calendar['id'], $child->agent_id);
        $this->assertSame($a['id'], $child->parent_action_id);
        $this->assertSame(1, (int) $child->delegation_depth);
        $this->assertStringContainsString('Delegated by your teammate Inbox', $child->prompt);
        $pinned = json_decode($child->grant_snapshot, true);
        $this->assertSame([$this->github], array_column($pinned, 'connectionId'), 'The child holds its own grants, never the parent\'s.');
        $this->assertSame('waiting_for_tool', $this->runState($this->parent['id']));
        // The parent cannot finish while its task is out, and its action keeps waiting.
        $this->complete($this->claimed, 'Done.')->assertStatus(409)->assertJsonPath('code', 'actions_open');
        $this->runnerAction($this->claimed, $a['id'])->assertOk()->assertJsonPath('action.state', 'dispatching');

        $kid = $this->claim();
        $this->assertSame($child->id, $kid['id']);
        $this->assertSame([$this->github], array_values(array_unique(array_column($kid['tools']['tools'], 'connectionId'))));
        $this->assertNotContains('delegate_task', array_column($kid['tools']['tools'], 'tool'), 'A delegate may not delegate further.');
        $this->callTool($kid, 'gmail_search', $this->gmail, ['query' => 'x'], 'k-gmail')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'not_granted');
        $this->complete($kid, 'Two repositories: qa-org/sandbox and qa-org/site.')->assertOk()->assertJsonPath('run.state', 'completed');

        $done = $this->runnerAction($this->claimed, $a['id'])->assertOk()->assertJsonPath('action.state', 'completed')->json('action');
        $this->assertSame('Two repositories: qa-org/sandbox and qa-org/site.', $done['result']['answer']);
        $this->assertSame('Calendar', $done['result']['teammate']);
        $this->assertNull($done['receipt'], 'A delegation is not a service action and writes no receipt.');
        $this->complete($this->claimed, 'The launch plan is ready.')->assertOk();
        // One thread: the parent's run lists what it handed out; the child names who handed it over.
        $view = $this->getJson('/api/agents/v2/runs/'.$this->parent['id'])->assertOk();
        $view->assertJsonPath('run.delegates.0.runId', $child->id)->assertJsonPath('run.delegates.0.state', 'completed')
            ->assertJsonPath('run.delegates.0.agentName', 'Calendar')->assertJsonPath('run.actions.0.provider', 'delegation');
        $this->assertGreaterThanOrEqual(0, $view->json('run.delegates.0.seconds'));
        $this->getJson('/api/agents/v2/runs/'.$child->id)->assertOk()->assertJsonPath('run.delegation.parentRunId', $this->parent['id'])
            ->assertJsonPath('run.delegation.parentAgentName', 'Inbox')->assertJsonPath('run.delegation.depth', 1);
        $types = DB::table('agent_run_events')->where('run_id', $this->parent['id'])->pluck('type')->all();
        $this->assertContains('delegation.started', $types);
        $this->assertContains('delegation.finished', $types);
        $this->assertSame(0, DB::table('agent_receipts')->where('run_id', $this->parent['id'])->count());
    }

    public function test_a_retried_call_admits_one_child_and_the_cap_counts_per_run(): void
    {
        config(['agent_depth.delegations_per_run' => 2]);
        $others = [$this->teammate('Research')['id'], $this->teammate('Writer')['id']];
        $this->start();
        $first = $this->delegate($this->claimed, 'Calendar', 'One', 'same-call')->assertOk()->json('action.id');
        $this->assertSame($first, $this->delegate($this->claimed, 'Calendar', 'One', 'same-call')->assertOk()->json('action.id'));
        $this->delegate($this->claimed, 'Calendar', 'Different', 'same-call')->assertStatus(409)->assertJsonPath('code', 'call_conflict');
        $this->assertSame(1, DB::table('agent_runs')->where('parent_run_id', $this->parent['id'])->count());
        // The parent is waiting; a second hand-over happens after the first returns.
        $kid = $this->claim();
        $this->complete($kid, 'ok')->assertOk();
        $this->delegate($this->claimed, 'Research', 'Two', 'second')->assertOk()->assertJsonPath('action.state', 'dispatching');
        $kid = $this->claim();
        $this->complete($kid, 'ok')->assertOk();
        $this->delegate($this->claimed, 'Writer', 'Three', 'third')->assertOk()->assertJsonPath('action.state', 'refused')
            ->assertJsonPath('action.result.reason', 'delegation_limit');
        $this->assertSame(2, (int) DB::table('agent_runs')->where('id', $this->parent['id'])->value('delegations_started'));
        $this->assertNull(collect($this->getJson('/api/agents/v2/runs/'.$this->parent['id'].'/tools')->json('manifest.tools'))->firstWhere('tool', 'delegate_task'));
        $this->assertCount(2, $others);
    }

    public function test_cycles_unknown_names_and_a_second_level_are_refused(): void
    {
        $third = $this->teammate('Research');
        $this->start();
        $this->delegate($this->claimed, 'Inbox', 'Me again', 'self')->assertOk()->assertJsonPath('action.result.reason', 'delegation_cycle');
        $this->delegate($this->claimed, 'Nobody', 'Hello', 'nobody')->assertOk()->assertJsonPath('action.result.reason', 'unknown_teammate');
        $this->assertStringContainsString('Calendar', $this->delegate($this->claimed, 'Nobody', 'Hello', 'nobody2')->json('action.result.error'));
        $this->assertSame(0, DB::table('agent_runs')->whereNotNull('parent_run_id')->count());
        $this->delegate($this->claimed, 'Calendar', 'Do it', 'ok')->assertOk()->assertJsonPath('action.state', 'dispatching');
        $kid = $this->claim();
        // The delegate hands nothing on: back to its parent is a cycle, to anyone else is too deep.
        $this->delegate($kid, 'Inbox', 'Back up', 'up', $kid['id'])->assertOk()->assertJsonPath('action.result.reason', 'delegation_cycle');
        $this->delegate($kid, $third['name'], 'Sideways', 'down', $kid['id'])->assertOk()->assertJsonPath('action.result.reason', 'delegation_depth');
        // With a deeper limit a chain may grow, but never back onto itself.
        config(['agent_depth.delegation_depth' => 2]);
        $this->delegate($kid, 'Inbox', 'Loop', 'loop', $kid['id'])->assertOk()->assertJsonPath('action.result.reason', 'delegation_cycle');
        $this->delegate($kid, 'Calendar', 'Self', 'self2', $kid['id'])->assertOk()->assertJsonPath('action.result.reason', 'delegation_cycle');
        $this->delegate($kid, $third['name'], 'Deeper', 'deeper', $kid['id'])->assertOk()->assertJsonPath('action.state', 'dispatching');
    }

    public function test_the_childs_approvals_reach_the_person_and_a_failed_or_cancelled_child_ends_the_wait(): void
    {
        $this->start();
        $a = $this->delegate($this->claimed, 'Calendar', 'Open an issue', 'd1')->assertOk()->json('action');
        $kid = $this->claim();
        $write = $this->callTool($kid, 'github_create_issue', $this->github, ['repository' => 'qa-org/sandbox', 'title' => 'Sync'], 'k1')
            ->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        $view = $this->getJson('/api/agents/v2/runs/'.$kid['id'])->assertOk();
        $this->assertSame($this->fingerprintOf($write), $view->json('run.actions.0.fingerprint'));
        $roster = collect($this->getJson('/api/agents/v2/roster', ['X-Vibyra-Device' => 'mac-1'])->json('teammates'))->firstWhere('agentId', $this->calendar['id']);
        $this->assertSame(1, $roster['waitingApprovalCount']);
        $this->postJson('/api/agents/v2/actions/'.$write['id'].'/decision', ['fingerprint' => $this->fingerprintOf($write), 'decision' => 'decline'])
            ->assertOk()->assertJsonPath('action.state', 'declined');
        $this->failRun($kid, 'The provider stopped.')->assertOk();
        $this->runnerAction($this->claimed, $a['id'])->assertOk()->assertJsonPath('action.state', 'failed')
            ->assertJsonPath('action.result.error', 'Calendar could not finish the delegated task.');
        $this->assertSame('waiting_for_tool', $this->runState($this->parent['id']), 'The parent carries on once the runner next posts.');
    }
}
