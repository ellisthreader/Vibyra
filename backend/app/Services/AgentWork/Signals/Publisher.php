<?php
namespace App\Services\AgentWork\Signals;
use App\Jobs\DeliverPhoneNotification;
use Illuminate\Support\Facades\{DB,Schema};
use Illuminate\Support\Str;
/** Shares the existing private inbox and unique per-device outbox; transport stays untouched. */
final class Publisher
{
    public function item(int $user,string $fingerprint,string $source,string $run,string $phase,string $category,string $title,array $destination,array $metadata): string
    {
        DB::table('work_events')->insertOrIgnore(['user_id'=>$user,'source'=>$source,'run_id'=>$run,'fingerprint'=>$fingerprint,
            'phase'=>$phase,'metadata'=>json_encode($metadata),'created_at'=>now(),'published_at'=>now()]);
        $event=DB::table('work_events')->where('fingerprint',$fingerprint)->value('id');
        $existing=DB::table('notification_items')->where('event_id',$event)->value('id'); if($existing)return $existing;
        $id=(string)Str::uuid(); $extra=[];
        // The live APNs line has richer item fields; older local fixtures do not. Never replace its transport.
        if(Schema::hasColumn('notification_items','body')) $extra=['body'=>'Agents','thread'=>$source.':'.$run,'level'=>$category==='attention'?'time-sensitive':'active'];
        DB::table('notification_items')->insert(['id'=>$id,'user_id'=>$user,'event_id'=>$event,'category'=>$category,'title'=>$title,
            'destination'=>json_encode($destination),'created_at'=>now(),'expires_at'=>now()->addDay(),...$extra]);
        $immediate=$source==='agent_digest' || app(NotificationPolicy::class)->registered($id);
        foreach(DB::table('notification_devices')->where('user_id',$user)->whereNull('revoked_at')->get() as $d) {
            DB::table('notification_deliveries')->insertOrIgnore(['item_id'=>$id,'device_id'=>$d->id,'generation'=>$d->generation,
                'state'=>$immediate?'pending':'suppressed','next_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
            $delivery=DB::table('notification_deliveries')->where('item_id',$id)->where('device_id',$d->id)->value('id');
            if($immediate && config('intelligence.push')) DeliverPhoneNotification::dispatch($delivery)->afterCommit();
        }
        return $id;
    }
}
