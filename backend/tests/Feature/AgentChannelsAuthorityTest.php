<?php
namespace Tests\Feature;
use App\Models\AgentChannels\InboundEvent;
use App\Services\AgentChannels\{Admit,Intake};
use Illuminate\Support\Facades\DB;
final class AgentChannelsAuthorityTest extends AgentChannelsTestCase
{
    public function test_missing_channel_context_cannot_fall_back_to_private_profile_or_tools(): void
    {
        $run=$this->startChannel();DB::table('agent_channel_runs')->where('run_id',$run['id'])->delete();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/tools'),['generation'=>$run['generation'],'callId'=>'missing','tool'=>'propose_channel_reply',
            'connectionId'=>$run['id'],'schemaRevision'=>\App\Services\AgentChannels\ReplyTool::revision(),'arguments'=>['text'=>'reply']],$this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code','channel_context_missing');
    }
    public function test_connection_generation_or_selected_account_change_blocks_queued_admission(): void
    {
        app(Intake::class)->accept($this->envelope());$event=InboundEvent::firstOrFail();$this->bot->forceFill(['generation'=>2])->save();
        app(Admit::class)->event($event->id);$this->assertSame('blocked',$event->fresh()->state);$this->assertDatabaseCount('agent_channel_runs',0);
        $this->getJson('/api/agents/v2/channels/'.$this->binding['id'])->assertOk()->assertJsonPath('binding.ready',false);
    }
    public function test_pro_downgrade_blocks_queued_and_running_effects_but_history_and_revoke_remain(): void
    {
        config(['vibes.plan_limits_enabled'=>true]);$this->user->forceFill(['plan'=>'pro','membership_ends_at'=>now()->addDay()])->save();
        $run=$this->startChannel();$action=$this->reply($run);$this->user->forceFill(['plan'=>'free','membership_ends_at'=>null])->save();
        $this->decide($action)->assertStatus(402);$this->getJson('/api/agents/v2/channels/'.$this->binding['id'])->assertOk();
        $this->deleteJson('/api/agents/v2/channels/'.$this->binding['id'],['expectedRevision'=>1])->assertOk();
        $this->assertSame(0,$this->sent('POST','#chat.postMessage#'));
    }
}
