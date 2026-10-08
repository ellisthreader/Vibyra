<?php
namespace App\Services\AgentWork\Signals;
use App\Services\Notifications\{AgentRunNotifications,Preferences};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class Digests
{
    public function tick(): int
    {
        if(!Settings::enabled() || !AgentRunNotifications::enabled())return 0;
        $users=DB::table('notification_preferences')->where('agent_mode','daily')->whereExists(fn($q)=>$q->selectRaw('1')
            ->from('agent_signal_digest_items')->whereColumn('user_id','notification_preferences.user_id')->whereNull('digest_id')->whereNull('discarded_at'))
            ->orderByRaw('agent_digest_checked_at ASC NULLS FIRST')->orderBy('user_id')->limit(100)->pluck('user_id');
        $count=0;
        foreach($users as $user) {
            try { if($this->publish($user))$count++; }
            catch (\Throwable $e) {
                report($e);
                // Outside the rolled-back publication transaction: this malformed account cannot monopolize the next batch.
                DB::table('notification_preferences')->where('user_id',$user)->update(['agent_digest_checked_at'=>now()]);
            }
        }
        return $count;
    }
    public function publish(int $user): ?string
    {
        return DB::transaction(function()use($user){
            $p=DB::table('notification_preferences')->where('user_id',$user)->lockForUpdate()->first();
            if($p)DB::table('notification_preferences')->where('user_id',$user)->update(['agent_digest_checked_at'=>now()]);
            if(!Settings::enabled() || !AgentRunNotifications::enabled() || !$p || $p->agent_mode!=='daily' || app(Preferences::class)->quiet($p))return null;
            $local=now()->setTimezone($p->timezone); $date=$local->toDateString();
            if(DB::table('agent_signal_digests')->where('user_id',$user)->where('local_date',$date)->exists())return null;
            $minute=$local->hour*60+$local->minute;
            $due=$minute>=(int)$p->agent_digest_minute?$date:$local->copy()->subDay()->toDateString();
            $items=app(DigestRead::class)->items($user,null,$due);
            if(!$items) {
                $ids=DB::table('agent_signal_digest_items')->where('user_id',$user)->whereNull('digest_id')->whereNull('discarded_at')->where('due_date','<=',$due)->orderBy('created_at')->limit(200)->pluck('item_id');
                DB::table('agent_signal_digest_items')->whereIn('item_id',$ids)->update(['discarded_at'=>now()]); return null;
            }
            $id=(string)Str::uuid();
            DB::table('agent_signal_digests')->insert(['id'=>$id,'user_id'=>$user,'local_date'=>$date,'timezone'=>$p->timezone,'created_at'=>now()]);
            $item=app(Publisher::class)->item($user,hash('sha256','agent_digest:'.$user.':'.$date),'agent_digest',$id,'agent_digest','replies',
                'Your daily Agent summary',['source'=>'agent_digest','digestId'=>$id],['count'=>count($items)]);
            DB::table('agent_signal_digests')->where('id',$id)->update(['notification_id'=>$item]);
            DB::table('agent_signal_digest_items')->where('user_id',$user)->whereNull('digest_id')->whereIn('item_id',array_column($items,'notificationId'))->update(['digest_id'=>$id]);
            return $id;
        });
    }
    public function current(object $item,object $event): bool
    {
        return Settings::enabled() && DB::table('agent_signal_digests')->where('id',$event->run_id)->where('user_id',$item->user_id)->exists()
            && app(DigestRead::class)->items($item->user_id,$event->run_id)!==[];
    }
    public function find(int $user,string $id): array
    {
        $d=DB::table('agent_signal_digests')->where('id',$id)->where('user_id',$user)->first(); abort_unless($d,404);
        return app(DigestRead::class)->payload($d);
    }
    public function list(int $user): array
    {
        return DB::table('agent_signal_digests')->where('user_id',$user)->orderByDesc('created_at')->limit(14)->get()
            ->map(fn($d)=>app(DigestRead::class)->payload($d))->all();
    }
}
