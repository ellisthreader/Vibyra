<?php
namespace App\Services\AgentWork\Signals;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class Findings
{
    public function compare(object $w,array $old,array $next): void
    {
        foreach ($next as $number=>$after) {
            $before=$old[$number]??null; if (!$before) continue;
            $kind=null;
            if ($before['state']!==$after['state'] || $before['merged']!==$after['merged'] || $before['draft']!==$after['draft']) $kind='status_changed';
            if ($after['state']==='open' && $after['mergeable']===false && $before['mergeable']!==false) $kind='merge_conflict';
            if ($after['state']==='open' && $after['mergeable']===true && $before['mergeable']===false) $kind='conflict_resolved';
            if (!$kind) continue;
            $title='Pull request #'.$number.match($kind){'merge_conflict'=>' cannot merge automatically','conflict_resolved'=>' can merge automatically again',default=>' changed status'};
            $source=['provider'=>'github','repository'=>$w->repository,'number'=>(int)$number,'url'=>'https://github.com/'.$w->repository.'/pull/'.$number];
            DB::table('agent_signal_findings')->insertOrIgnore(['id'=>(string)Str::uuid(),'user_id'=>$w->user_id,'watch_id'=>$w->id,
                'goal_id'=>$w->goal_id??null,'agent_id'=>$w->agent_id,'watch_revision'=>$w->revision,'fingerprint'=>hash('sha256',$w->id.':'.$w->revision.':'.json_encode([$number,$before,$after])),
                'kind'=>$kind,'title'=>$title,'source'=>json_encode($source),'evidence'=>json_encode(['before'=>$before,'after'=>$after]),
                'observed_at'=>now(),'source_updated_at'=>$after['updatedAt'],'expires_at'=>now()->addDay()]);
        }
    }
    public function list(int $user,string $agent): array
    {
        return DB::table('agent_signal_findings')->where('user_id',$user)->where('agent_id',$agent)->whereNull('dismissed_at')
            ->orderByDesc('observed_at')->limit(50)->get()->map(function($f){
                $w=DB::table('agent_signal_watches')->where('id',$f->watch_id)->first();
                $fresh=$w && $w->revision===$f->watch_revision && now()->lt($f->expires_at) && app(WatchAuthority::class)->current($w)!==null;
                return ['id'=>$f->id,'watchId'=>$f->watch_id,'agentId'=>$f->agent_id,'kind'=>$f->kind,'title'=>$f->title,
                    'goalContext'=>app(GoalContext::class)->payload($f->user_id,$f->agent_id,$f->goal_id),
                    'source'=>json_decode($f->source,true),'evidence'=>json_decode($f->evidence,true),'confidence'=>'verified',
                    'observedAt'=>Times::iso($f->observed_at),'sourceUpdatedAt'=>Times::iso($f->source_updated_at),'expiresAt'=>Times::iso($f->expires_at),'fresh'=>$fresh];
            })->all();
    }
    public function dismiss(int $user,string $id): void
    {
        abort_unless(DB::table('agent_signal_findings')->where('id',$id)->where('user_id',$user)->exists(),404);
        DB::table('agent_signal_findings')->where('id',$id)->where('user_id',$user)->whereNull('dismissed_at')->update(['dismissed_at'=>now()]);
    }
}
