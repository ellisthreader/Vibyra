<?php
namespace Tests\Feature;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Runs, Canonical};
use App\Services\AgentWork\SkillSnapshots;
use App\Services\Agents\Skills;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture, AgentWorkProposalFixture};
use Tests\TestCase;

final class AgentStageFourSkillsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentWorkProposalFixture;
    protected function setUp(): void { parent::setUp(); $this->bootV2(); config(['agents_v2.work_enabled' => true]); }

    public function test_assigned_skill_is_pinned_at_admission_and_later_edit_does_not_rewrite_claim(): void
    {
        $skill = app(Skills::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'revision' => 0,
            'name' => 'Evidence', 'instructions' => 'Cite saved source receipts.', 'teammateIds' => [$this->agent['id']]]);
        $this->admit(); $claimed = $this->claim();
        $this->assertSame('Cite saved source receipts.', $claimed['profile']['skills'][0]['instructions']);
        $this->assertSame(1, $claimed['profile']['skills'][0]['revision']);
        app(Skills::class)->save($this->user->id, ['id' => $skill['id'], 'revision' => 1,
            'name' => 'Evidence', 'instructions' => 'Now use new instructions.', 'teammateIds' => [$this->agent['id']]]);
        $run = Run::findOrFail($claimed['id']);
        $payload = app(Runs::class)->claimPayload($run, ['tools' => []]);
        $this->assertSame('Cite saved source receipts.', $payload['profile']['skills'][0]['instructions']);
        $this->assertNotSame(SkillSnapshots::selectionHash($this->user->id, $run->agent_id), SkillSnapshots::runHash($run));
        $cipher = DB::table('agent_run_skill_snapshots')->where('run_id', $run->id)->value('skills');
        $this->assertStringNotContainsString('Cite saved source receipts', $cipher);
        config(['agents_v2.work_enabled' => false]);
        $this->assertSame($payload['profile']['skills'], SkillSnapshots::forRun($run));
    }

    public function test_new_skill_does_not_attach_itself_to_older_admitted_task(): void
    {
        $this->admit(); $claimed = $this->claim();
        $this->assertSame([], $claimed['profile']['skills']);
        app(Skills::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'revision' => 0,
            'name' => 'New', 'instructions' => 'For new tasks only.', 'teammateIds' => [$this->agent['id']]]);
        $this->assertSame(Canonical::hash([]), SkillSnapshots::runHash(Run::findOrFail($claimed['id'])));
    }

    public function test_skill_assignment_change_after_proposal_invalidates_that_review(): void
    {
        [, $p] = $this->draft('goal', $this->goalSpec());
        app(Skills::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'revision' => 0,
            'name' => 'Changed', 'instructions' => 'New assigned rules.', 'teammateIds' => [$this->agent['id']]]);
        $this->acceptProposal($p)->assertStatus(409);
        $this->assertDatabaseCount('agent_work_goals', 0);
        $this->assertDatabaseCount('agent_work_activations', 0);
    }
}
