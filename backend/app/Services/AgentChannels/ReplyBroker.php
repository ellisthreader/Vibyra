<?php
namespace App\Services\AgentChannels;
use App\Models\AgentV2\{Run,ToolAction};
use App\Services\AgentRuns\{ApiError,Canonical,Events,Lifecycle,RunStates};
use App\Services\AgentRuns\Tools\{Approvals,Providers\Schema};
final class ReplyBroker
{
    public function request(Run $run,array $call): ToolAction
    {
        $c=RunContext::context($run);abort_unless($c&&$call['connectionId']===$run->id,403);
        if($call['schemaRevision']!==ReplyTool::revision())ApiError::throw(409,'schema_changed','Refresh the channel reply tool.');
        Schema::only($call['arguments'],['text']);$text=Schema::text($call['arguments']['text']??null,4000,'Write a reply of 1–4,000 characters.');
        if($run->tool_calls>=(int)config('agents_v2.max_tool_calls'))ApiError::throw(409,'limit_reached','This task reached its tool-call limit.');
        if(ToolAction::where('run_id',$run->id)->where('tool',ReplyTool::NAME)->whereIn('state',['pending_approval','approved','dispatching','completed','unknown'])->exists())
            ApiError::throw(409,'channel_reply_exists','This message already has a pending, sent or uncertain reply. Check that receipt first.');
        $b=app(Bindings::class)->find($run->user_id,$c['bindingId']);$i=app(Identities::class)->find($run->user_id,$b->identity_id);$dest=$c['destination'];
        $args=['text'=>$text,'provider'=>$c['provider'],'workspaceId'=>$dest['workspaceId'],'audienceId'=>$b->audience_id,'conversationId'=>$dest['conversationId'],
            'threadId'=>$dest['threadId'],'bindingId'=>$b->id,'bindingRevision'=>$b->revision,'identityId'=>$i->id,'identityRevision'=>$i->revision,
            'senderLabel'=>$c['senderLabel'],'audienceLabel'=>$c['audience']['label']];
        $action=ToolAction::create(['run_id'=>$run->id,'user_id'=>$run->user_id,'instruction_revision'=>$run->instruction_revision,'call_id'=>$call['callId'],
            'tool'=>ReplyTool::NAME,'kind'=>'write','connection_id'=>$run->id,'connection_generation'=>$b->revision,'grant_id'=>$i->id,'grant_revision'=>$i->revision,
            'arguments'=>$args,'args_hash'=>Canonical::hash($call['arguments']),'schema_revision'=>$call['schemaRevision'],'state'=>'pending_approval',
            'expires_at'=>now()->addSeconds((int)config('agents_v2.approval_seconds')),'summary'=>'Review reply to '.$c['audience']['label']]);
        $action->forceFill(['fingerprint'=>Approvals::fingerprint($action,$run->user_id),'secret_kinds'=>\App\Services\AgentRuns\Guard\SecretGuard::enabled()?(\App\Services\AgentRuns\Guard\SecretGuard::kindsIn($args)?:null):null])->save();$run->forceFill(['tool_calls'=>$run->tool_calls+1])->save();
        app(Events::class)->append($run,'approval.requested',['actionId'=>$action->id,'tool'=>$action->tool,'connectionId'=>$run->id,'account'=>$c['senderLabel'],
            'arguments'=>\App\Services\AgentRuns\Guard\SecretGuard::enabled()?\App\Services\AgentRuns\Guard\SecretGuard::redactValue($args):$args,'fingerprint'=>$action->fingerprint,'expiresAt'=>$action->expires_at->toIso8601String()]);
        app(Lifecycle::class)->move($run,RunStates::WAITING_APPROVAL,null,['actionId'=>$action->id,'tool'=>$action->tool]);return $action;
    }
}
