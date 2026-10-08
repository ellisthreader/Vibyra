<?php
namespace App\Services\AgentWork\Signals;
use App\Services\AgentRuns\Tools\Providers\GithubWrites;
use Illuminate\Support\Facades\DB;
final class Watches
{
    public const COVERAGE='Latest 30 pull requests; mergeability inspected for up to 5. Partial coverage.';
    public function save(int $user,string $id,array $d): array
    {
        $repo=strtolower(GithubWrites::repository($d['repository']));
        return DB::transaction(function()use($user,$id,$d,$repo){
            DB::table('users')->where('id',$user)->lockForUpdate()->first();
            $old=DB::table('agent_signal_watches')->where('id',$id)->lockForUpdate()->first();
            abort_if($old && $old->user_id!==$user,404);
            Settings::revision((int)($old->revision??0),$d['expectedRevision']);
            if (!$d['enabled'] && $old) {
                DB::table('agent_signal_watches')->where('id',$id)->update(['enabled'=>false,'revision'=>$old->revision+1,'lease'=>null,'lease_expires_at'=>null,'updated_at'=>now()]);
                return $this->payload(DB::table('agent_signal_watches')->where('id',$id)->first());
            }
            app(WatchAuthority::class)->requireCreation($user);
            [$c,$g]=app(WatchAuthority::class)->selected($user,$d['agentId'],$d['connectionId']);
            $goal=app(GoalContext::class)->selected($user,$d['agentId'],array_key_exists('goalId',$d)?$d['goalId']:($old->goal_id??null));
            abort_unless(DB::table('agent_signal_watches')->where('user_id',$user)->where('enabled',true)->where('id','!=',$id)->count()<5,422,'Watch up to five repositories.');
            abort_if(DB::table('agent_signal_watches')->where('user_id',$user)->where('agent_id',$d['agentId'])->where('connection_id',$c->id)
                ->where('repository',$repo)->where('enabled',true)->where('id','!=',$id)->exists(),409,'This teammate already watches that repository.');
            $v=['user_id'=>$user,'agent_id'=>$d['agentId'],'connection_id'=>$c->id,'grant_id'=>$g->id,
                'goal_id'=>$goal,'connection_generation'=>$c->generation,'grant_revision'=>$g->revision,'repository'=>$repo,'enabled'=>$d['enabled'],
                'revision'=>($old->revision??0)+1,'observations'=>null,'last_checked_at'=>null,'next_check_at'=>now(),
                'lease'=>null,'lease_expires_at'=>null,'error'=>null,'created_at'=>$old->created_at??now(),'updated_at'=>now()];
            DB::table('agent_signal_watches')->updateOrInsert(['id'=>$id],$v);
            return $this->payload(DB::table('agent_signal_watches')->where('id',$id)->first());
        });
    }
    public function list(int $user,string $agent): array
    {
        return DB::table('agent_signal_watches')->where('user_id',$user)->where('agent_id',$agent)->orderBy('created_at')->get()->map(fn($w)=>$this->payload($w))->all();
    }
    public function payload(object $w): array
    {
        $active=app(WatchAuthority::class)->current($w)!==null;
        return ['id'=>$w->id,'agentId'=>$w->agent_id,'connectionId'=>$w->connection_id,'repository'=>$w->repository,
            'goalId'=>$w->goal_id,'goalContext'=>app(GoalContext::class)->payload($w->user_id,$w->agent_id,$w->goal_id),
            'enabled'=>(bool)$w->enabled,'revision'=>(int)$w->revision,'status'=>!$w->enabled?'paused':($active?'watching':'needs_review'),
            'lastCheckedAt'=>Times::iso($w->last_checked_at),'nextCheckAt'=>Times::iso($w->next_check_at),'error'=>$w->error?:($w->enabled&&!$active?'access_changed':null),'coverage'=>self::COVERAGE];
    }
}
