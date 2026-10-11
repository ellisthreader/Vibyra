<?php
namespace Tests\Feature;
use App\Models\AgentV2\{RuntimeBinding,ToolAction};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class AgentBrowserWorkflowsBoundariesTest extends \Tests\TestCase
{
    use RefreshDatabase,\Tests\Support\BrowserWorkflowFixture;
    protected function setUp(): void{parent::setUp();$this->bootWorkflow();}
    public function test_completed_step_replay_returns_same_receipt_and_changed_arguments_still_conflict(): void
    {
        $w=$this->draft();$run=$this->opened($w);$a=$this->typed($run);
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertOk()->assertJsonPath('action.id',$a['id'])->assertJsonPath('action.state','completed');
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'changed'],'type')->assertStatus(409)->assertJsonPath('code','call_conflict');
        $this->assertSame(1,ToolAction::where('run_id',$run['id'])->where('tool','browser_type')->count());
    }
    public function test_submit_waits_for_exact_approval_and_unknown_receipt_cannot_pass(): void
    {
        $w=$this->draft('submit');$run=$this->opened($w);$args=['ref'=>'e3','pageFingerprint'=>str_repeat('b',64)];
        $a=$this->callTool($run,'browser_submit',$this->connection,$args,'submit')->assertOk()->assertJsonPath('action.state','pending_approval')->json('action');
        $this->browserClaim($run,$a)->assertStatus(409);$this->decide($a)->assertOk()->assertJsonPath('action.state','approved');
        $this->browserRun($run,$a,['submitted'=>true,'url'=>'https://shop.example.com/contact'])->assertOk()->assertJsonPath('action.state','unknown');
        $this->callTool($run,'browser_submit',$this->connection,$args,'retry')->assertOk()->assertJsonPath('action.state','refused');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'),['generation'=>$run['generation'],'answer'=>'Done'],$this->runnerHeaders())->assertOk();
        $this->getJson('/api/agents/v2/browser-workflows/'.$w['id'])->assertOk()->assertJsonPath('workflow.testState','failed');
        $this->postJson('/api/agents/v2/browser-workflows/'.$w['id'].'/save',$this->review($w))->assertStatus(409);
    }
    public function test_start_lost_response_is_idempotent_and_request_id_cannot_cross_workflow(): void
    {
        $w=$this->draft();$second=$this->draft();$key=(string)Str::uuid();$first=$this->start($w,$key)->assertOk()->json('runId');
        $this->start($w,$key)->assertOk()->assertJsonPath('runId',$first);$this->start($second,$key)->assertStatus(409);
        $this->assertDatabaseCount('agent_browser_workflow_tests',1);
    }
    public function test_changes_to_steps_invalidate_active_execution_without_granting_any_new_effect(): void
    {
        $w=$this->draft();$run=$this->opened($w);$path='/api/agents/v2/browser-workflows/'.$w['id'];
        $this->putJson($path,['expectedRevision'=>1,'name'=>'Changed review','steps'=>$w['steps']])->assertOk()->assertJsonPath('workflow.revision',2);
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertStatus(409)->assertJsonPath('code','browser_test_access_changed');
        $this->postJson($path.'/save',$this->review($w))->assertStatus(409);
    }
    public function test_missing_context_and_runtime_capability_downgrade_fail_closed(): void
    {
        $w=$this->draft();$run=$this->opened($w);$runtime=RuntimeBinding::findOrFail($this->runtime['id']);$caps=$runtime->capabilities;
        $runtime->forceFill(['capabilities'=>[...$caps,'browserWorkflowsV1'=>false]])->save();
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertStatus(409)->assertJsonPath('code','runtime_upgrade');
        $runtime->forceFill(['capabilities'=>$caps])->save();DB::table('agent_browser_workflow_tests')->where('run_id',$run['id'])->delete();
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertStatus(409)->assertJsonPath('code','browser_test_context_missing');
    }
    public function test_cancel_downgrade_and_revoke_block_effects_but_cancel_remains_available(): void
    {
        config(['vibes.plan_limits_enabled'=>true]);$w=$this->draft();$run=$this->opened($w);
        $this->user->forceFill(['plan'=>'free','membership_ends_at'=>null])->save();
        $this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertStatus(402);
        $this->user->forceFill(['plan'=>'pro','membership_ends_at'=>now()->addDay()])->save();
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser',$this->browserExpected())->assertOk();$this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertStatus(409);
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk();$this->getJson('/api/agents/v2/browser-workflows/'.$w['id'])->assertOk();
    }
}
