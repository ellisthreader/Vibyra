<?php
namespace Tests\Feature;

use App\Models\AgentV2\WorkProposal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentWorkProposalFixture};
use Tests\TestCase;

final class AgentStageFourProposalsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentWorkProposalFixture;

    protected function setUp(): void { parent::setUp(); $this->bootV2(); config(['agents_v2.work_enabled' => true]); }

    public function test_model_draft_is_inert_and_tool_replay_is_one_draft_inside_tool_cap(): void
    {
        [$run, $p] = $this->draft();
        $this->assertContains('propose_work', array_column($run['tools']['tools'], 'tool'));
        $this->assertLessThanOrEqual(10, count($run['tools']['tools']));
        $this->assertSame($this->runtime['id'], $p['runtimeId']);
        $this->assertSame('acct-1', $p['runtime']['accountRef']);
        $this->callTool($run, 'propose_work', $run['id'], ['kind' => 'skill', 'spec' => $this->skillSpec()], 'draft-1')
            ->assertOk()->assertJsonPath('action.result.proposalId', $p['id']);
        $this->assertDatabaseCount('agent_work_proposals', 1);
        $this->assertDatabaseCount('agent_skills', 0);
        $this->assertDatabaseCount('agent_schedules', 0);
        $this->assertDatabaseCount('agent_runs', 1);
        $this->getJson('/api/agents/v2/proposals?runId='.$run['id'].'&agentId='.$this->agent['id'])->assertOk()
            ->assertJsonPath('proposals.0.id', $p['id']);
        Http::assertNothingSent();
    }

    public function test_explicit_skill_review_assigns_once_without_grants_and_lost_response_replay_returns_receipt(): void
    {
        [, $p] = $this->draft();
        $accepted = $this->acceptProposal($p)->assertOk()->assertJsonPath('proposal.status', 'accepted')->json('proposal');
        $this->acceptProposal($p)->assertOk()->assertJsonPath('proposal.activation.id', $accepted['activation']['id']);
        $this->getJson('/api/agents/v2/proposals/'.$p['id'])->assertOk()->assertJsonPath('proposal.status', 'accepted');
        $this->assertDatabaseCount('agent_skills', 1);
        $this->assertDatabaseCount('agent_skill_assignments', 1);
        $this->assertDatabaseCount('agent_grants', 0);
        $this->assertSame('skill', $accepted['activation']['kind']);
        $this->assertDatabaseHas('agent_skill_assignments', ['skill_id' => $accepted['activation']['id'], 'agent_id' => $this->agent['id']]);
    }

    public function test_edited_draft_invalidates_old_revision_and_hash(): void
    {
        [, $p] = $this->draft();
        $spec = [...$p['spec'], 'name' => 'New instructions', 'assignToAgent' => false];
        $fresh = $this->patchJson('/api/agents/v2/proposals/'.$p['id'], ['revision' => 1, 'spec' => $spec])
            ->assertOk()->assertJsonPath('proposal.revision', 2)->json('proposal');
        $this->acceptProposal($p)->assertStatus(409)->assertJsonPath('code', 'proposal_changed');
        $this->acceptProposal([...$fresh, 'reviewHash' => $p['reviewHash']])->assertStatus(409);
        $this->acceptProposal($fresh)->assertOk();
        $this->assertDatabaseCount('agent_skill_assignments', 0);
        $this->assertDatabaseHas('agent_skills', ['name' => 'New instructions']);
    }

    public function test_goal_acceptance_saves_exact_spec_without_admitting_until_scanner(): void
    {
        [, $p] = $this->draft('goal', $this->goalSpec());
        $this->assertDatabaseCount('agent_work_goals', 0);
        $a = $this->acceptProposal($p)->assertOk()->json('proposal.activation');
        $this->assertSame('goal', $a['kind']);
        $this->assertDatabaseCount('agent_work_goals', 1);
        $this->assertDatabaseCount('agent_runs', 1);
        $this->acceptProposal($p)->assertOk()->assertJsonPath('proposal.activation.id', $a['id']);
        $this->assertDatabaseCount('agent_work_activations', 1);
    }

    public function test_routine_and_timed_followup_activate_only_after_explicit_review(): void
    {
        [, $p] = $this->draft('routine', ['title' => 'Weekly review', 'prompt' => 'Summarize changes.', 'timezone' => 'Europe/London',
            'recurrence' => ['type' => 'weekly', 'time' => '09:00', 'weekdays' => [1]]]);
        $this->assertDatabaseCount('agent_schedules', 0);
        $this->acceptProposal($p)->assertOk()->assertJsonPath('proposal.activation.kind', 'routine');
        $this->acceptProposal($p)->assertOk();
        $this->assertDatabaseCount('agent_schedules', 1);
        $model = WorkProposal::findOrFail($p['id']);
        $follow = app(\App\Services\AgentWork\Proposals\Proposals::class)->create(
            \App\Models\AgentV2\Run::findOrFail($model->run_id), 'followup', ['title' => 'Check result', 'prompt' => 'Review the result.',
                'expiresAt' => now()->addDays(2)->toIso8601String(), 'condition' => ['kind' => 'time', 'at' => now()->addDay()->toIso8601String()]]);
        $payload = app(\App\Services\AgentWork\Proposals\Proposals::class)->payload($follow);
        $this->acceptProposal($payload)->assertOk()->assertJsonPath('proposal.activation.kind', 'followup');
        $this->assertDatabaseCount('agent_work_followups', 1);
        $this->assertDatabaseCount('agent_runs', 1);
        Http::assertNothingSent();
    }
}
