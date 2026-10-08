<?php
namespace App\Services\AgentWork\Signals;
use App\Services\Notifications\{Inbox,Preferences};
use Illuminate\Support\Facades\DB;
final class DigestRead
{
    public function items(int $user,?string $digest=null,?string $date=null): array
    {
        $p=app(Preferences::class)->get($user);
        $ids=DB::table('agent_signal_digest_items')->where('user_id',$user)->whereNull('discarded_at')
            ->when($digest,fn($q)=>$q->where('digest_id',$digest),fn($q)=>$q->whereNull('digest_id')->where('due_date','<=',$date))
            ->orderBy('created_at')->limit(200)->pluck('item_id'); $out=[];
        foreach(DB::table('notification_items')->where('user_id',$user)->whereIn('id',$ids)->orderBy('created_at')->get() as $item) {
            $event=DB::table('work_events')->where('id',$item->event_id)->first();
            if(!$event || $event->source!=='agent_run' || !NotificationPolicy::categoryAllowed($p,$item,$event) || !app(Inbox::class)->current($item))continue;
            $d=json_decode($item->destination,true);
            if(!DB::table('agent_runs')->where('id',$d['runId']??'')->where('user_id',$user)->where('agent_id',$d['agentId']??'')->exists())continue;
            $out[]=['notificationId'=>$item->id,'agentId'=>$d['agentId'],'runId'=>$d['runId'],'conversationId'=>$d['conversationId'],
                'kind'=>$d['kind'],'title'=>$item->title,'createdAt'=>Times::iso($item->created_at)];
        }
        return $out;
    }
    public function payload(object $d): array
    {
        $item=DB::table('notification_items')->where('id',$d->notification_id)->where('user_id',$d->user_id)->first();
        return ['id'=>$d->id,'date'=>$d->local_date,'timezone'=>$d->timezone,'createdAt'=>Times::iso($d->created_at),
            'items'=>$this->items($d->user_id,$d->id),'read'=>$item?->read_at!==null,'notificationId'=>$d->notification_id];
    }
}
