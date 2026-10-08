<?php
namespace App\Services\AgentWork\Signals;
use App\Services\Notifications\Preferences;
use Illuminate\Support\Facades\DB;
final class NotificationPolicy
{
    public static function allowed(object $p,string $phase): bool
    {
        if (!Settings::enabled() || !str_starts_with($phase,'agent_')) return true;
        $mode=$p->agent_mode??'all';
        if ($phase==='agent_digest') return $mode==='daily';
        if ($mode==='daily') return self::urgent($phase);
        return $mode==='all' || in_array($phase,['agent_approval','agent_signin','agent_failed','agent_blocked'],true);
    }
    public static function urgent(string $phase): bool
    { return in_array($phase,['agent_approval','agent_signin','agent_failed','agent_blocked'],true); }
    /** Keep the canonical individual inbox item; buffer only an opaque reference for daily delivery. */
    public function registered(string $id): bool
    {
        $item=DB::table('notification_items')->where('id',$id)->first();
        $phase=(string)DB::table('work_events')->where('id',$item->event_id)->value('phase');
        $p=app(Preferences::class)->get($item->user_id);
        if (Settings::enabled() && ($p->agent_mode??'all')==='daily' && !self::urgent($phase)) {
            if (!in_array($phase,['agent_approval','agent_signin'],true))
                DB::table('notification_items')->where('id',$id)->update(['expires_at'=>now()->addDays(3)]);
            $local=now()->setTimezone($p->timezone); $minute=$local->hour*60+$local->minute;
            $due=($minute>=(int)$p->agent_digest_minute?$local->copy()->addDay():$local)->toDateString();
            DB::table('agent_signal_digest_items')->insertOrIgnore(['item_id'=>$id,'user_id'=>$item->user_id,'created_at'=>now(),'due_date'=>$due]);
        }
        $allowed=self::allowed($p,$phase);
        if (!$allowed) {
            $event=DB::table('work_events')->where('id',$item->event_id)->first();
            $metadata=json_decode($event->metadata,true)?:[]; $metadata['alertSuppressed']=true;
            DB::table('work_events')->where('id',$event->id)->update(['metadata'=>json_encode($metadata)]);
        }
        return $allowed;
    }
    /** Native polling follows the same policy as push without losing deferred quiet-hour items. */
    public function disposition(object $item): string
    {
        $event=DB::table('work_events')->where('id',$item->event_id)->first();
        if (!$event || !in_array($event->source,['agent_run','agent_digest'],true)) return 'eligible';
        $metadata=json_decode($event->metadata,true)?:[];
        $preferences=app(Preferences::class); $p=$preferences->get($item->user_id);
        if (($metadata['alertSuppressed']??false) || !$preferences->allows($p,$item->category,$event->phase)) return 'suppressed';
        return $preferences->quiet($p)?'deferred':'eligible';
    }
    public static function categoryAllowed(object $p,object $item,object $event): bool
    {
        $key=$item->category==='attention' && in_array($event->phase,['failed','agent_failed','cloud_failed'],true)?'failures':$item->category;
        return (bool)($p->{$key}??true);
    }
}
