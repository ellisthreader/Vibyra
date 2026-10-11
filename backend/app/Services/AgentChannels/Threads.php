<?php
namespace App\Services\AgentChannels;
use App\Models\AgentChannels\{Thread,InboundEvent,Audience};
use App\Models\AgentV2\ToolAction;
use Illuminate\Support\Facades\DB;
final class Threads
{
    public function list(int $userId,string $bindingId): array
    {
        app(Bindings::class)->find($userId,$bindingId);
        return Thread::where('user_id',$userId)->where('binding_id',$bindingId)->latest('updated_at')->limit(30)->get()->map(fn($t)=>$this->payload($t))->all();
    }
    public function find(int $userId,string $id): array{return $this->payload(Thread::where('user_id',$userId)->whereKey($id)->firstOrFail());}
    private function payload(Thread $t): array
    {
        $b=app(Bindings::class)->find($t->user_id,$t->binding_id);$runIds=DB::table('agent_channel_runs')->where('thread_id',$t->id)->latest('created_at')->limit(20)->pluck('run_id')->all();
        $messages=InboundEvent::where('thread_id',$t->id)->latest('received_at')->limit(20)->get()->reverse()->map(fn($e)=>[
            'id'=>$e->id,'providerEventId'=>$e->provider_event_id,'actorId'=>$e->actor_id,'text'=>$e->text,'receivedAt'=>$e->received_at->toIso8601String(),'runId'=>$e->run_id,'state'=>$e->state])->values()->all();
        $replies=ToolAction::where('user_id',$t->user_id)->whereIn('run_id',$runIds)->where('tool',ReplyTool::NAME)->latest()->limit(20)->get()->map(fn($a)=>[
            'actionId'=>$a->id,'text'=>$a->arguments['text'],'state'=>$a->state,'receivedAt'=>$a->created_at->toIso8601String(),'providerMessageId'=>$a->result['id']??null])->all();
        return ['id'=>$t->id,'bindingId'=>$b->id,'provider'=>$t->destination['provider'],'audience'=>app(Audiences::class)->payload(Audience::findOrFail($b->audience_id)),
            'threadId'=>$t->destination['threadId'],'createdAt'=>$t->created_at->toIso8601String(),'updatedAt'=>$t->updated_at->toIso8601String(),
            'messages'=>$messages,'runIds'=>$runIds,'replies'=>$replies];
    }
}
