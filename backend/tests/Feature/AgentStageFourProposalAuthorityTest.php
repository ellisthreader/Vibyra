<?php
namespace Tests\Feature;

use App\Models\AgentV2\{RuntimeBinding, WorkProposal};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture, AgentWorkProposalFixture};
use Tests\TestCase;

final class AgentStageFourProposalAuthorityTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentWorkProposalFixture;
    protected function setUp(): void { parent::setUp(); $this->bootV2(); config(['agents_v2.work_enabled' => true]); }

    public function test_runner_cannot_accept_and_foreign_owner_cannot_read_or_edit(): void
    {
        [, $p] = $this->draft(); $path = '/api/agents/v2/proposals/'.$p['id'];
        $this->postJson($path.'/accept', ['revision' => 1, 'reviewHash' => $p['reviewHash']], $this->runnerHeaders())->assertForbidden();
        WorkProposal::whereKey($p['id'])->update(['user_id' => \App\Models\User::factory()->create()->id]);
        $this->getJson($path)->assertNotFound();
        $this->acceptProposal($p)->assertNotFound();
        $this->patchJson($path, ['revision' => 1, 'spec' => $p['spec']])->assertNotFound();
        $this->getJson('/api/agents/v2/proposals')->assertOk()->assertJsonCount(0, 'proposals');
    }

    public function test_changed_model_blocks_acceptance_but_key_rotation_alone_does_not(): void
    {
        [, $p] = $this->draft();
        RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'different-model']);
        $this->acceptProposal($p)->assertStatus(409)->assertJsonPath('code', 'work_runtime_changed');
        $this->assertDatabaseCount('agent_skills', 0);
        RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'gpt-5.5', 'revision' => 50]);
        $this->acceptProposal($p)->assertOk();
    }

    public function test_expiry_discard_and_paused_feature_cannot_activate_but_owner_can_read_discard(): void
    {
        [, $p] = $this->draft();
        WorkProposal::whereKey($p['id'])->update(['expires_at' => now()->subMinute()]);
        $this->getJson('/api/agents/v2/proposals/'.$p['id'])->assertOk()->assertJsonPath('proposal.status', 'expired');
        $this->acceptProposal($p)->assertStatus(409)->assertJsonPath('code', 'proposal_expired');
        config(['agents_v2.work_enabled' => false]);
        $this->postJson('/api/agents/v2/proposals/'.$p['id'].'/discard', ['revision' => 1])->assertOk()
            ->assertJsonPath('proposal.status', 'discarded');
        $this->acceptProposal($p)->assertStatus(409);
        $this->assertDatabaseCount('agent_skills', 0);
    }

    public function test_untrusted_fields_runtime_override_and_oversize_are_rejected(): void
    {
        $this->admit(); $run = $this->claim();
        foreach ([['kind' => 'skill', 'spec' => [...$this->skillSpec(), 'runtimeId' => $this->runtime['id']]],
            ['kind' => 'skill', 'spec' => [...$this->skillSpec(), 'grant' => 'all']],
            ['kind' => 'skill', 'spec' => [...$this->skillSpec(), 'instructions' => str_repeat('x', 32001)]],
            ['kind' => 'goal', 'spec' => [...$this->goalSpec(), 'milestones' => [['key' => 'a', 'title' => 'A', 'prompt' => 'x',
                'successCriteria' => 'x', 'dependsOn' => ['a']]]]]] as $i => $args) {
            $this->callTool($run, 'propose_work', $run['id'], $args, 'bad-'.$i)->assertStatus(422);
        }
        $this->assertDatabaseCount('agent_work_proposals', 0);
    }

    public function test_stale_lease_wrong_scope_and_feature_flag_refuse_drafts(): void
    {
        $this->admit(); $run = $this->claim(); $args = ['kind' => 'skill', 'spec' => $this->skillSpec()];
        $this->callTool([...$run, 'generation' => $run['generation'] + 1], 'propose_work', $run['id'], $args, 'stale')->assertStatus(409);
        $this->callTool($run, 'propose_work', (string) \Illuminate\Support\Str::uuid(), $args, 'scope')->assertForbidden();
        config(['agents_v2.work_enabled' => false]);
        $this->callTool($run, 'propose_work', $run['id'], $args, 'off')->assertStatus(503);
        $this->assertDatabaseCount('agent_work_proposals', 0);
    }

    public function test_context_read_supplies_trusted_clock_and_sources_without_saving_work(): void
    {
        $this->admit(); $run = $this->claim();
        $r = $this->callTool($run, 'propose_work', $run['id'], ['kind' => 'context'], 'context')->assertOk()
            ->assertJsonPath('action.result.sources', [])->assertJsonPath('action.result.partial', false);
        $this->assertNotEmpty($r->json('action.result.currentTime'));
        $this->assertDatabaseCount('agent_work_proposals', 0);
        $this->assertDatabaseCount('agent_runs', 1);
    }
}
