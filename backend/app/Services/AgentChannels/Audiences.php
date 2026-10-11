<?php
namespace App\Services\AgentChannels;
use App\Models\AgentChannels\{Audience,Identity};
use App\Services\AgentRuns\Canonical;
final class Audiences
{
    public function observe(Identity $i,array $event): Audience
    {
        $destination=$event['destination']; unset($destination['threadId'],$destination['activityId']);
        $hash=Canonical::hash($destination); $old=Audience::where('identity_id',$i->id)->where('audience_hash',$hash)->first();
        if(!$old && Audience::where('identity_id',$i->id)->count()>=50) abort(429,'The observed audience limit was reached.');
        $a=$old??new Audience(['user_id'=>$i->user_id,'identity_id'=>$i->id,'audience_hash'=>$hash]);
        $a->forceFill(['destination'=>$destination,'kind'=>$event['kind'],'label'=>mb_substr($event['label'],0,200),'last_seen_at'=>now()])->save();return $a;
    }
    public function payload(Audience $a): array
    {
        $d=$a->destination;
        return ['id'=>$a->id,'identityId'=>$a->identity_id,'provider'=>$d['provider'],'workspaceId'=>$d['workspaceId'],
            'conversationId'=>$d['conversationId'],'kind'=>$a->kind,'label'=>$a->label,'lastSeenAt'=>$a->last_seen_at->toIso8601String()];
    }
    public function list(int $userId): array
    {
        return Audience::where('user_id',$userId)->latest('last_seen_at')->limit(50)->get()->map(fn($a)=>$this->payload($a))->all();
    }
}
