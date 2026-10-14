<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Root-reported NIC high-water marks cannot be replayed to reset daily quotas. */
final class PreviewEgress
{
    public function record(object $w, int $counter): array
    {
        DB::table('cloud_workspace_control')->where('id', 1)->lockForUpdate()->firstOrFail();
        $day = now()->toDateString();
        DB::table('vibes_spend_days')->insertOrIgnore(['day'=>$day]);
        DB::table('vibes_spend_days')->where('day',$day)->lockForUpdate()->firstOrFail();
        $key = $w->id.':'.$w->generation;
        $r = DB::table('cloud_egress_counters')->where('id',$key)->first();
        abort_if($r && $counter < $r->bytes, 409, 'Runtime egress counter reset. Restart with a fresh generation.');
        $delta = $counter - (int) ($r->bytes ?? 0);
        DB::table('cloud_egress_days')->insertOrIgnore(['user_id'=>$w->user_id,'day'=>$day,'bytes'=>0,'held'=>0]);
        $oldHeld = max(0,(int)($r->authorized_bytes ?? 0) - (int)($r->bytes ?? 0));
        $outstanding = max(0,(int)($r->authorized_bytes ?? 0) - $counter);
        if ($r && $r->day !== $day) {
            DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$r->day)->decrement('held',$oldHeld);
            DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$day)->increment('held',$outstanding);
        } elseif ($oldHeld > $outstanding) {
            DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$day)->decrement('held',$oldHeld-$outstanding);
        }
        if ($delta > 0) {
            $rate = (int) config('cloud_preview.egress_micro_per_gib');
            abort_unless($rate > 0, 503, 'Cloud network costs need verification.');
            $micro = intdiv($delta * $rate + 1073741823,1073741824);
            app(PreviewCosts::class)->guard($w,$micro);
            DB::table('cloud_provider_exposures')->insertOrIgnore(['idempotency_key'=>'egress:'.$key.':'.$counter,
                'workspace_id'=>$w->id,'generation'=>$w->generation,'trial'=>$w->compute_trial ?? false,
                'kind'=>'egress_estimate','micro_usd'=>$micro,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$day)->increment('bytes',$delta);
        }
        $account=DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$day)->first();
        $global=(int)DB::table('cloud_egress_days')->where('day',$day)->selectRaw('COALESCE(SUM(bytes+held),0) AS total')->value('total');
        $available=max(0,min((int)config('cloud_preview.account_egress_bytes_day')-(int)$account->bytes-(int)$account->held,
            (int)config('cloud_preview.global_egress_bytes_day')-$global));
        $window=min(2097152,$available+$outstanding);
        $extra=max(0,$window-$outstanding);
        if ($extra>0) DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$day)->increment('held',$extra);
        DB::table('cloud_egress_counters')->updateOrInsert(['id'=>$key],['workspace_id'=>$w->id,'generation'=>$w->generation,'bytes'=>$counter,'authorized_bytes'=>$counter+$window,'day'=>$day,'updated_at'=>now()]);
        app(PreviewCosts::class)->guard($w,0);
        return $this->remaining($w);
    }
    /** Stopped provider: absorb the last signed window conservatively, never free it for reuse. */
    public function close(object $w): void
    {
        if (!($w->compute_profile ?? null)) return;
        DB::table('cloud_workspace_control')->where('id',1)->lockForUpdate()->firstOrFail();
        $key=$w->id.':'.$w->generation;
        $r=DB::table('cloud_egress_counters')->where('id',$key)->first();
        if (!$r || $r->authorized_bytes === $r->bytes) return;
        $left=(int)$r->authorized_bytes-(int)$r->bytes;
        DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$r->day)->decrement('held',$left);
        DB::table('cloud_egress_days')->where('user_id',$w->user_id)->where('day',$r->day)->increment('bytes',$left);
        DB::table('cloud_provider_exposures')->insertOrIgnore(['idempotency_key'=>'egress-final:'.$key,
            'workspace_id'=>$w->id,'generation'=>$w->generation,'trial'=>$w->compute_trial,'kind'=>'egress_final_window_estimate',
            'micro_usd'=>intdiv($left*(int)config('cloud_preview.egress_micro_per_gib')+1073741823,1073741824),'created_at'=>now(),'updated_at'=>now()]);
        DB::table('cloud_egress_counters')->where('id',$key)->update(['bytes'=>$r->authorized_bytes,'updated_at'=>now()]);
    }
    public function remaining(object $w): array
    {
        $day=now()->toDateString();
        $r=DB::table('cloud_egress_counters')->where('id',$w->id.':'.$w->generation)->first();
        return ['day'=>$day,'bytes'=>$r ? max(0,(int)$r->authorized_bytes-(int)$r->bytes) : 0];
    }
}
