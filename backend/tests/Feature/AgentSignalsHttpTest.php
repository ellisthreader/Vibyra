<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture,AgentSignalsFixture};
use Tests\TestCase;
class AgentSignalsHttpTest extends TestCase
{
    use RefreshDatabase,AgentV2Fixture,AgentSignalsFixture;
    protected function setUp():void { parent::setUp(); $this->signalsBoot(); }
    public function test_explicit_scope_save_is_revisioned_and_runner_cannot_save_it():void
    {
        $c=$this->github();$id=(string)Str::uuid();$body=['expectedRevision'=>0,'agentId'=>$this->agent['id'],'connectionId'=>$c,'repository'=>'fixture/repo','enabled'=>true];
        $this->putJson('/api/agents/v2/signals/watches/'.$id,$body,$this->runnerHeaders())->assertForbidden();
        $this->withHeaders(['X-Vibyra-Runner-Key'=>'']);
        $this->flushHeaders()->withToken('v2-session')->putJson('/api/agents/v2/signals/watches/'.$id,$body)->assertOk()->assertJsonPath('watch.revision',1);
        $this->putJson('/api/agents/v2/signals/watches/'.$id,$body)->assertStatus(409)->assertJsonPath('code','signals_changed');
        $this->getJson('/api/agents/v2/signals?agentId='.$this->agent['id'])->assertOk()->assertJsonPath('connections.0.readGranted',true)->assertJsonPath('enabled',true);
        config(['agents_v2.work_enabled'=>false]);
        $this->getJson('/api/agents/v2/signals?agentId='.$this->agent['id'])->assertOk()->assertJsonPath('enabled',false);
        $this->putJson('/api/agents/v2/signals/watches/'.$id,array_replace($body,['expectedRevision'=>1,'enabled'=>false]))->assertOk()->assertJsonPath('watch.enabled',false);
        $this->assertDatabaseCount('agent_runs',0);
    }
    public function test_read_grant_and_exact_repository_are_required_and_duplicate_scopes_refused():void
    {
        $c=$this->github(); $body=['expectedRevision'=>0,'agentId'=>$this->agent['id'],'connectionId'=>$c,'repository'=>'fixture/repo?all=true','enabled'=>true];
        $this->putJson('/api/agents/v2/signals/watches/'.Str::uuid(),$body)->assertUnprocessable();
        $body['repository']='fixture/repo'; $this->putJson('/api/agents/v2/signals/watches/'.Str::uuid(),$body)->assertOk();
        $body['repository']='FIXTURE/REPO'; $this->putJson('/api/agents/v2/signals/watches/'.Str::uuid(),$body)->assertStatus(409);
        DB::table('agent_grants')->where('connection_id',$c)->update(['revoked_at'=>now()]);
        $this->putJson('/api/agents/v2/signals/watches/'.Str::uuid(),$body)->assertStatus(409);
    }
    public function test_onboarding_and_preferences_are_owned_validated_and_cas_guarded():void
    {
        $uri='/api/agents/v2/signals/onboarding'; $body=['expectedRevision'=>0,'agentId'=>$this->agent['id'],'interests'=>['email'],'dismissed'=>false];
        $this->putJson($uri,$body)->assertOk()->assertJsonPath('onboarding.suggestions.0.ready',false);
        $this->putJson($uri,$body)->assertStatus(409);
        $this->putJson($uri,array_replace($body,['expectedRevision'=>1,'interests'=>['arbitrary-instruction']]))->assertUnprocessable();
        $p=$this->getJson('/api/agents/v2/signals?agentId='.$this->agent['id'])->assertOk()->json('preferences');
        $this->putJson('/api/agents/v2/signals/preferences',['expectedRevision'=>$p['revision'],'mode'=>'daily','timezone'=>'invalid',
            'quietStart'=>null,'quietEnd'=>null,'digestMinute'=>540])->assertUnprocessable();
        $this->assertDatabaseCount('agent_runs',0);$this->assertDatabaseCount('agent_schedules',0);
    }
}
