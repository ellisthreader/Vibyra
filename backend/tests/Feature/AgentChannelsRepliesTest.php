<?php
namespace Tests\Feature;
use App\Models\AgentV2\{Run,ToolAction};
use App\Services\AgentChannels\{Bindings,Replies};
use App\Services\AgentRuns\Tools\{Approvals,DispatchSweeper};
use Illuminate\Support\Facades\{DB,Http};
final class AgentChannelsRepliesTest extends AgentChannelsTestCase
{
    public function test_exact_approval_commits_before_provider_io_and_duplicate_allow_sends_once(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);
        $this->route('POST','#slack.com/api/chat.postMessage#',function($r)use($action){
            $this->assertSame(0,DB::transactionLevel());$this->assertSame('dispatching',ToolAction::findOrFail($action['id'])->state);
            $this->assertSame('C0123456789',$r['channel']);$this->assertSame('1790000000.000001',$r['thread_ts']);
            return Http::response(['ok'=>true,'channel'=>$r['channel'],'ts'=>'1790000001.000001']);
        });
        $this->assertSame(0,$this->sent('POST','#chat.postMessage#'));
        $this->decide($action)->assertOk()->assertJsonPath('action.state','completed');
        $this->decide($action)->assertOk()->assertJsonPath('action.state','completed');
        $this->assertSame(1,$this->sent('POST','#chat.postMessage#'));$this->assertDatabaseCount('agent_receipts',1);
    }
    public function test_unknown_send_is_never_resent_by_retry_sweep_or_new_call_id(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);$this->route('POST','#chat.postMessage#',$this->timeout());
        $this->decide($action)->assertOk()->assertJsonPath('action.state','unknown');$this->decide($action)->assertOk();
        app(DispatchSweeper::class)->sweep();$this->assertSame(1,$this->sent('POST','#chat.postMessage#'));
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/tools'),['generation'=>$run['generation'],'callId'=>'new-attempt','tool'=>'propose_channel_reply',
            'connectionId'=>$run['id'],'schemaRevision'=>\App\Services\AgentChannels\ReplyTool::revision(),'arguments'=>['text'=>'Another reply']],$this->runnerHeaders())->assertStatus(409);
    }
    public function test_actual_provider_receipt_survives_revoke_during_send(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);
        $this->route('POST','#chat.postMessage#',function($r){
            app(Bindings::class)->revoke($this->user->id,$this->binding['id'],1);
            return Http::response(['ok'=>true,'channel'=>$r['channel'],'ts'=>'1790000001.000009']);
        });
        $this->decide($action)->assertOk()->assertJsonPath('action.state','completed');
        $this->assertSame('cancelled',Run::findOrFail($run['id'])->state);$this->assertSame(1,$this->sent('POST','#chat.postMessage#'));
        $this->assertSame('1790000001.000009',ToolAction::findOrFail($action['id'])->result['id']);
    }
    public function test_flag_off_blocks_new_dispatch_and_read_revoke_still_work(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);config(['agents_v2.channels_enabled'=>false]);
        $this->decide($action)->assertStatus(409);$this->getJson('/api/agents/v2/channels/'.$this->binding['id'])->assertOk();
        $this->deleteJson('/api/agents/v2/channels/'.$this->binding['id'],['expectedRevision'=>1])->assertOk();
        $this->assertSame(0,$this->sent('POST','#chat.postMessage#'));
    }
    public function test_crashed_dispatch_intent_becomes_unknown_without_any_provider_retry(): void
    {
        $run=$this->startChannel();$action=$this->reply($run);
        ToolAction::findOrFail($action['id'])->forceFill(['state'=>'dispatching','dispatched_at'=>now()->subMinutes(10),'updated_at'=>now()->subMinutes(10)])->save();
        $stats=app(DispatchSweeper::class)->sweep();$this->assertSame(1,$stats['unknown']);
        $this->assertSame('unknown',ToolAction::findOrFail($action['id'])->state);$this->assertSame(0,$this->sent('POST','#chat.postMessage#'));
    }
}
