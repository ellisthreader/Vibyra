<?php
namespace Tests\Feature;
use App\Models\AgentCoordination\Workflow;
use App\Models\AgentV2\Run;
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
final class AgentCoordinationProtocolTest extends AgentWorkTestCase
{
    use \Tests\Support\AgentCoordinationFixture;
    protected function setUp(): void { parent::setUp(); $this->coordinationRuntime(); }
    private function startPlanning(): array
    {
        $other = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Research',
            'brief' => 'Research.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['memory' => 'UNSELECTED_PRIVATE_MEMORY']);
        $id = (string) Str::uuid();
        $this->putJson('/api/agents/v2/groups/'.$id, ['expectedRevision' => 0, 'name' => 'Report team', 'coordinatorId' => $this->agent['id'],
            'members' => [['agentId' => $this->agent['id'], 'handle' => 'lead'], ['agentId' => $other['id'], 'handle' => 'research']]])->assertOk();
        $p = $this->postJson('/api/agents/v2/groups/'.$id.'/messages', ['expectedRevision' => 1, 'runtimeId' => $this->runtime['id'], 'expectedRuntimeRevision' => $this->runtime['revision'],
            'idempotencyKey' => 'protocol-planning', 'prompt' => 'Prepare a verified report.', 'mentions' => [],
            'sharedContext' => ['text' => 'Selected test context', 'outputs' => []]])->assertOk()->json();
        $r = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertOk()->json('run');
        $this->assertSame($p['run']['id'], $r['id']); $this->assertSame([], $r['history']); $this->assertSame('', $r['profile']['memory']);
        $this->assertSame(['propose_work'], array_column($r['tools']['tools'], 'tool'));
        return [$r, $other, $id];
    }
    public function test_real_leased_proposal_edit_accept_replay_child_completion_and_final_review_protocol(): void
    {
        [$run, $other, $group] = $this->startPlanning();
        $spec = ['title' => 'Review report', 'expiresAt' => now()->addDay()->toIso8601String(), 'steps' => [
            ['key' => 'a', 'agentId' => $this->agent['id'], 'title' => 'Review', 'prompt' => 'Review evidence.', 'successCriteria' => 'Saved review', 'dependsOn' => []],
            ['key' => 'b', 'agentId' => $other['id'], 'title' => 'Research', 'prompt' => 'Research evidence.', 'successCriteria' => 'Saved research', 'dependsOn' => []]],
            'finalCriteria' => 'An evidence based report.'];
        $result = $this->callTool($run, 'propose_work', $run['id'], ['kind' => 'workflow', 'spec' => $spec], 'plan-1')->assertOk()->json('action.result');
        $this->assertFalse($result['active']); $this->assertDatabaseCount('agent_workflows', 0); $this->assertDatabaseCount('agent_runs', 1);
        $p = $this->getJson('/api/agents/v2/proposals/'.$result['proposalId'])->assertOk()->json('proposal');
        $this->assertSame($group, $p['runtime']['coordination']['groupId']); $this->assertCount(2, $p['runtime']['coordination']['members']);
        $edited = [...$p['spec'], 'title' => 'Reviewed title'];
        $new = $this->patchJson('/api/agents/v2/proposals/'.$p['id'], ['revision' => $p['revision'], 'spec' => $edited])->assertOk()->json('proposal');
        $this->postJson('/api/agents/v2/proposals/'.$p['id'].'/accept', ['revision' => $p['revision'], 'reviewHash' => $p['reviewHash']])->assertStatus(409);
        $receipt = $this->postJson('/api/agents/v2/proposals/'.$p['id'].'/accept', ['revision' => $new['revision'], 'reviewHash' => $new['reviewHash']])->assertOk()->json('proposal');
        $this->postJson('/api/agents/v2/proposals/'.$p['id'].'/accept', ['revision' => $new['revision'], 'reviewHash' => $new['reviewHash']])->assertOk()->assertJsonPath('proposal.activation.id', $receipt['activation']['id']);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $run['generation'], 'answer' => 'Plan proposed for review.'], $this->runnerHeaders())->assertOk();
        app(\App\Services\AgentCoordination\WorkflowProgress::class)->tick();
        $first = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertOk()->json('run');
        $second = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 1], $this->runnerHeaders())->assertOk()->json('run');
        $this->assertNotSame($first['id'], $second['id']);
        foreach ([$first, $second] as $r) {
            $this->assertNotContains('propose_work', array_column($r['tools']['tools'], 'tool')); $this->assertSame('', $r['profile']['memory']);
            $this->postJson($this->runnerPath('/runs/'.$r['id'].'/complete'), ['generation' => $r['generation'], 'answer' => 'Actual leased result '.$r['agentId']], $this->runnerHeaders())->assertOk();
        }
        app(\App\Services\AgentCoordination\WorkflowProgress::class)->tick();
        $final = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertOk()->json('run');
        $this->assertStringContainsString('Actual leased result', $final['prompt']);
        $this->postJson($this->runnerPath('/runs/'.$final['id'].'/complete'), ['generation' => $final['generation'], 'answer' => 'Checked final report.'], $this->runnerHeaders())->assertOk();
        app(\App\Services\AgentCoordination\WorkflowProgress::class)->tick(); $w = Workflow::find($receipt['activation']['id']);
        $this->getJson('/api/agents/v2/workflows/'.$w->id)->assertOk()->assertJsonPath('workflow.status', 'awaiting_review');
        $this->postJson('/api/agents/v2/workflows/'.$w->id.'/confirm', ['revision' => $w->revision])->assertOk()->assertJsonPath('workflow.status', 'completed');
        $this->assertDatabaseCount('agent_runs', 4); Http::assertNothingSent();
    }
    public function test_stale_group_candidate_does_not_starve_unrelated_ordinary_task(): void
    {
        [$planning, $other, $group] = $this->startPlanning();
        // Return the planning attempt to an unclaimed queue position, then revoke its membership snapshot.
        Run::whereKey($planning['id'])->update(['state' => 'queued', 'lease_expires_at' => null]);
        DB::table('agent_groups')->where('id', $group)->increment('revision');
        [$valid] = app(\App\Services\AgentRuns\Admission::class)->admit($this->user->id, ['agentId' => $this->agent['id'],
            'runtimeId' => $this->runtime['id'], 'prompt' => 'An unrelated ordinary task.', 'attachments' => [], 'idempotencyKey' => 'ordinary-valid']);
        $r = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertOk()->json('run');
        $this->assertSame($valid->id, $r['id']); $this->assertSame('queued', Run::find($planning['id'])->state);
    }
    public function test_changed_runtime_revision_cannot_silently_retarget_group_send(): void
    {
        [$planning, $other, $group] = $this->startPlanning();
        \App\Models\AgentV2\RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'opus', 'revision' => $this->runtime['revision'] + 1]);
        $this->postJson('/api/agents/v2/groups/'.$group.'/messages', ['expectedRevision' => 1, 'runtimeId' => $this->runtime['id'],
            'expectedRuntimeRevision' => $this->runtime['revision'], 'idempotencyKey' => 'stale-selection', 'prompt' => 'Another report.',
            'mentions' => [], 'sharedContext' => ['text' => '', 'outputs' => []]])->assertStatus(409)->assertJsonPath('code', 'runtime_changed');
        $this->assertDatabaseCount('agent_group_messages', 1); $this->assertDatabaseCount('agent_runs', 1);
    }

    public function test_cancelled_workflow_keeps_factual_lease_reads_but_blocks_new_effects(): void
    {
        [$run, $other, $group] = $this->startPlanning();
        $spec = ['title' => 'One task', 'expiresAt' => now()->addDay()->toIso8601String(), 'steps' => [
            ['key' => 'a', 'agentId' => $other['id'], 'title' => 'Research', 'prompt' => 'Research evidence.', 'successCriteria' => 'Saved research', 'dependsOn' => []]],
            'finalCriteria' => 'Checked evidence.'];
        $id = $this->callTool($run, 'propose_work', $run['id'], ['kind' => 'workflow', 'spec' => $spec], 'cancel-plan')->assertOk()->json('action.result.proposalId');
        $p = $this->getJson('/api/agents/v2/proposals/'.$id)->assertOk()->json('proposal');
        $accepted = $this->postJson('/api/agents/v2/proposals/'.$id.'/accept', ['revision' => $p['revision'], 'reviewHash' => $p['reviewHash']])->assertOk()->json('proposal');
        app(\App\Services\AgentCoordination\WorkflowProgress::class)->tick();
        $child = $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 1], $this->runnerHeaders())->assertOk()->json('run');
        $w = Workflow::find($accepted['activation']['id']);
        $this->postJson('/api/agents/v2/workflows/'.$w->id.'/control', ['revision' => $w->revision, 'action' => 'cancel'])->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$child['id'].'/heartbeat'), ['generation' => $child['generation']], $this->runnerHeaders())
            ->assertOk()->assertJsonPath('state', 'cancelled')->assertJsonPath('cancelRequested', true);
        $this->callTool($child, 'save_output', $child['id'], ['kind' => 'checklist', 'title' => 'Too late', 'content' => ['items' => []]], 'late-effect')->assertStatus(409);
        $this->postJson($this->runnerPath('/runs/'.$child['id'].'/heartbeat'), ['generation' => $child['generation'] + 1], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'stale_lease');
    }

}
