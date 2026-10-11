<?php
namespace App\Services\AgentChannels;
use App\Models\AgentChannels\{Identity,Binding,Thread,InboundEvent};
use App\Services\AgentRuns\{Canonical,Jobs\AccountLock};
use Illuminate\Support\Facades\DB;
final class Intake
{
    /** Only normalized provider-authenticated envelopes enter this method. */
    public function accept(array $event): array
    {
        if(!config('agents_v2.channels_enabled')||!isset($event['provider']))return ['ok'=>true,'state'=>'ignored'];
        $matches=Identity::where('provider',$event['provider'])->where('workspace_id',$event['workspaceId'])->where('actor_id',$event['actorId'])->limit(51)->get()
            ->filter(fn($i)=>in_array($i->bot_id,$event['botIds'],true)&&app(Identities::class)->current($i));
        if($matches->pluck('user_id')->unique()->count()!==1||$matches->count()>50)return ['ok'=>true,'state'=>'unmapped'];
        // Multiple current identities for one actor are not implicitly allowed to fan out.
        $eligible=[];
        foreach($matches as $i) {
            $r=DB::transaction(function()use($i,$event){AccountLock::force($i->user_id);
                if(!app(Identities::class)->current($i))return null;
                $a=app(Audiences::class)->observe($i,$event);
                $b=Binding::where('identity_id',$i->id)->where('audience_id',$a->id)->whereNull('revoked_at')->first();
                return $b&&$b->expires_at->isFuture()?[$i,$b]:null;
            });if($r)$eligible[]=$r;
        }
        if(count($eligible)!==1)return ['ok'=>true,'state'=>count($eligible)?'ambiguous':'audience_observed'];
        [$identity,$binding]=$eligible[0];
        $saved=DB::transaction(function()use($identity,$binding,$event){
            AccountLock::force($identity->user_id);$b=app(Bindings::class)->find($identity->user_id,$binding->id,true);
            $hash=Canonical::hash([$event['provider'],$event['workspaceId'],$event['eventId']]);
            if($old=InboundEvent::where('user_id',$identity->user_id)->where('event_hash',$hash)->first())return [$old,true];
            if(!app(Bindings::class)->current($b))return null;
            if(InboundEvent::where('binding_id',$b->id)->where('received_at','>',now()->subHour())->count()>=$b->rate_per_hour)return null;
            $threadHash=Canonical::hash([$event['destination']['conversationId'],$event['destination']['threadId']]);
            $thread=Thread::firstOrCreate(['binding_id'=>$b->id,'thread_hash'=>$threadHash],['user_id'=>$b->user_id,'destination'=>$event['destination']]);
            $e=InboundEvent::create(['user_id'=>$b->user_id,'identity_id'=>$identity->id,'binding_id'=>$b->id,'binding_revision'=>$b->revision,
                'thread_id'=>$thread->id,'event_hash'=>$hash,'provider_event_id'=>$event['eventId'],'actor_id'=>$event['actorId'],'text'=>$event['text'],'destination'=>$event['destination'],'received_at'=>now()]);
            $thread->touch();DB::afterCommit(fn()=>\App\Jobs\ProcessAgentChannelEvent::dispatch($e->id));return [$e,false];
        });
        return ['ok'=>true,'channelHandled'=>true,'state'=>$saved?($saved[1]?'duplicate':'queued'):'blocked'];
    }
}
