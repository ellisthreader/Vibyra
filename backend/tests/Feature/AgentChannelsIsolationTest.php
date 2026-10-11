<?php
namespace Tests\Feature;
use App\Models\AgentChannels\{InboundEvent,Binding};
use App\Models\AgentV2\{Run,Job};
use App\Services\AgentChannels\{Admit,Intake,Bindings,ReplyTool};
use Illuminate\Support\Facades\DB;
final class AgentChannelsIsolationTest extends AgentChannelsTestCase
{
    public function test_verified_intake_deduplicates_and_private_profile_grants_history_never_enter_claim(): void
    {
        DB::table('agent_teammates')->where('id',$this->agent['id'])->update(['brief'=>'PRIVATE BRIEF','memory'=>'PRIVATE MEMORY']);
        $conn=$this->gmailInstall('fixture@example.invalid');$this->grant($conn);
        $prior=$this->admit('PRIVATE PRIOR QUESTION');Run::findOrFail($prior['id'])->forceFill(['state'=>'completed','answer'=>'PRIVATE ANSWER'])->save();
        $this->signedSlack($this->slackBody())->assertOk()->assertJsonPath('state','queued');
        $this->signedSlack($this->slackBody())->assertOk()->assertJsonPath('state','duplicate');
        $event=InboundEvent::firstOrFail();app(Admit::class)->event($event->id);app(Admit::class)->event($event->id);
        $run=$this->postJson($this->runnerPath('/claim'),['workerSlot'=>0],$this->runnerHeaders())->assertOk()->json('run');
        $this->assertSame('channel',Job::findOrFail($run['id'])->mode);$this->assertSame([],Run::findOrFail($run['id'])->grant_snapshot);
        $this->assertSame([],$run['history']);$this->assertSame([],$run['profile']['skills']);$this->assertSame('',$run['profile']['memory']);
        $this->assertSame([$run['tools']['tools'][0]['tool']],[ReplyTool::NAME]);$this->assertCount(1,$run['tools']['tools']);
        $this->assertStringNotContainsString('PRIVATE',json_encode($run));$this->assertStringNotContainsString('PRIVATE',json_encode(Job::findOrFail($run['id'])->context));
        $this->assertSame(1,InboundEvent::count());$this->assertDatabaseCount('agent_channel_runs',1);
        $this->postJson('/api/agents/v2/runs',['agentId'=>$this->agent['id'],'prompt'=>'Fake channel','idempotencyKey'=>'bad-public','executionMode'=>'channel'])->assertUnprocessable();
        $this->callTool($run,'gmail_search',$conn,['query'=>'secret'],'private-read')->assertForbidden();
    }
    public function test_unknown_actor_signature_and_app_mismatch_never_admit(): void
    {
        $body=$this->slackBody();$this->signedSlack($body,valid:false)->assertUnauthorized();
        $body['event']['user']='U1111111111';$this->signedSlack($body)->assertOk()->assertJsonPath('state','unmapped');
        $body['api_app_id']='A9999999999';$this->signedSlack($body)->assertForbidden();
        $this->assertDatabaseCount('agent_channel_events',0);$this->assertDatabaseCount('agent_channel_runs',0);
    }
    public function test_revocation_and_exact_readback_preserve_history_but_prevent_new_claim(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);
        $this->deleteJson('/api/agents/v2/channels/'.$this->binding['id'],['expectedRevision'=>1])->assertOk()->assertJsonPath('binding.revision',2);
        $this->getJson('/api/agents/v2/channels/'.$this->binding['id'])->assertOk()->assertJsonPath('binding.ready',false);
        $this->assertSame('cancelled',Run::findOrFail($run['id'])->state);$this->decide($action)->assertStatus(409);
        $this->signedSlack($this->slackBody())->assertOk()->assertJsonPath('state','audience_observed');
        $this->assertDatabaseCount('agent_channel_events',1);
    }
    public function test_thread_queue_waits_until_prior_run_finishes_and_excludes_other_thread(): void
    {
        $first=$this->startChannel();app(Intake::class)->accept($this->envelope('EvSECOND01','Same thread second'));
        $second=InboundEvent::where('provider_event_id','EvSECOND01')->firstOrFail();app(Admit::class)->event($second->id);$this->assertSame('pending',$second->fresh()->state);
        $other=$this->envelope('EvOTHER001','OTHER THREAD SECRET');$other['destination']['threadId']='1790000000.000099';app(Intake::class)->accept($other);
        $this->postJson($this->runnerPath('/runs/'.$first['id'].'/complete'),['generation'=>$first['generation'],'answer'=>'Private model draft never sent'],$this->runnerHeaders())->assertOk();
        app(Admit::class)->event($second->id);$run=Run::findOrFail($second->fresh()->run_id);
        $this->assertStringContainsString('Summarize the public release',$run->prompt);$this->assertStringNotContainsString('OTHER THREAD SECRET',$run->prompt);
        $this->assertStringNotContainsString('Private model draft never sent',$run->prompt);
    }
}
