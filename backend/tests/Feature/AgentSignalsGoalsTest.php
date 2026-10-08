<?php
namespace Tests\Feature;
use App\Models\AgentWork\Goal;
use App\Services\AgentWork\Signals\{Findings,GoalContext,Watches};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture,AgentSignalsFixture};
use Tests\TestCase;
class AgentSignalsGoalsTest extends TestCase
{
    use RefreshDatabase,AgentV2Fixture,AgentSignalsFixture;
    protected function setUp():void { parent::setUp(); $this->signalsBoot(); }
    private function goal(array $changes=[]):Goal
    {
        return Goal::create(array_replace(['user_id'=>$this->user->id,'agent_id'=>$this->agent['id'],'title'=>'Release fixture/repo',
            'runtime_binding_id'=>(string)Str::uuid(),'runtime_snapshot'=>[],'expires_at'=>now()->addDay(),
            'milestones'=>[['key'=>'verify','title'=>'Verify merge readiness','prompt'=>'Read pull requests.',
                'successCriteria'=>'The owner reviews source evidence.','dependsOn'=>[],'status'=>'pending','runId'=>null]]],$changes));
    }
    private function bind(array $watch,?string $goal):array
    {
        return app(Watches::class)->save($this->user->id,$watch['id'],['expectedRevision'=>$watch['revision'],'agentId'=>$this->agent['id'],
            'connectionId'=>$watch['connectionId'],'repository'=>$watch['repository'],'enabled'=>true,'goalId'=>$goal]);
    }
    private function conflict(string $watch):void
    {
        $this->fakePr($this->fact()); $this->scanAgain($watch); $this->travel(1)->minute();
        $this->fakePr($this->fact(['mergeable'=>false])); $this->scanAgain($watch);
    }
    public function test_only_explicit_same_teammate_goal_selection_creates_relevance_context():void
    {
        $goal=$this->goal(); $watch=$this->watch(); $this->conflict($watch['id']);
        $this->assertNull(app(Findings::class)->list($this->user->id,$this->agent['id'])[0]['goalContext']);
        $watch=$this->bind($watch,$goal->id); $this->assertSame($goal->id,$watch['goalContext']['id']);
        $this->conflict($watch['id']); $finding=app(Findings::class)->list($this->user->id,$this->agent['id'])[0];
        $this->assertSame($goal->id,$finding['goalContext']['id']);
        $this->assertSame('Verify merge readiness',$finding['goalContext']['milestone']['title']);
        $this->assertTrue($finding['goalContext']['reviewRequired']);
        $this->assertStringContainsString('You linked this repository',$finding['goalContext']['reason']);
        $this->assertSame('pending',$goal->fresh()->milestones[0]['status']);
        $this->assertSame('active',$goal->fresh()->status); $this->assertDatabaseCount('agent_runs',0);
    }
    public function test_goal_state_context_stays_current_but_retargeting_does_not_relabel_old_facts():void
    {
        $first=$this->goal(); $second=$this->goal(['title'=>'Another goal']); $watch=$this->bind($this->watch(),$first->id);
        $this->conflict($watch['id']); $first->forceFill(['status'=>'blocked','reason'=>'milestone_failed'])->save();
        $finding=app(Findings::class)->list($this->user->id,$this->agent['id'])[0];
        $this->assertSame('blocked',$finding['goalContext']['status']);
        $this->assertStringContainsString('affects its blocker',$finding['goalContext']['reason']);
        $watch=$this->bind($watch,$second->id); $finding=app(Findings::class)->list($this->user->id,$this->agent['id'])[0];
        $this->assertSame($first->id,$finding['goalContext']['id']); $this->assertFalse($finding['fresh']);
        $this->assertNull($this->bind($watch,null)['goalContext']);
    }
    public function test_foreign_owner_and_other_teammate_goals_cannot_be_selected_or_listed():void
    {
        $own=$this->goal(); $foreign=$this->goal(['user_id'=>\App\Models\User::factory()->create()->id]);
        $other=$this->goal(['agent_id'=>(string)Str::uuid()]); $watch=$this->watch();
        $this->getJson('/api/agents/v2/signals?agentId='.$this->agent['id'])->assertOk()->assertJsonPath('goals.0.id',$own->id)->assertJsonCount(1,'goals');
        foreach([$foreign->id,$other->id] as $id) $this->putJson('/api/agents/v2/signals/watches/'.$watch['id'],[
            'expectedRevision'=>$watch['revision'],'agentId'=>$this->agent['id'],'connectionId'=>$watch['connectionId'],
            'repository'=>$watch['repository'],'enabled'=>true,'goalId'=>$id])->assertNotFound();
        $this->assertNull(app(GoalContext::class)->payload($this->user->id,$this->agent['id'],$foreign->id));
        $this->assertDatabaseHas('agent_signal_watches',['id'=>$watch['id'],'goal_id'=>null,'revision'=>1]);
    }
}
