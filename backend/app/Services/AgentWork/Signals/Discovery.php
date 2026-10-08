<?php
namespace App\Services\AgentWork\Signals;
use App\Services\AgentRuns\Connections\Credentials;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
/** Bounded read-only scanner; HTTP outside locks, authority rechecked before each read and commit. */
final class Discovery
{
    public function tick(): int
    {
        if (!Settings::enabled()) return 0;
        $ids=DB::table('agent_signal_watches')->where('enabled',true)->where('next_check_at','<=',now())
            ->where(fn($q)=>$q->whereNull('lease_expires_at')->orWhere('lease_expires_at','<=',now()))->orderBy('next_check_at')->limit(10)->pluck('id');
        foreach ($ids as $id) {
            try { $this->scan($id); }
            catch (\Throwable $e) {
                report($e);
                // Do not clear a possibly replaced lease. Advance only this watch's retry time after rollback.
                DB::table('agent_signal_watches')->where('id',$id)->update(['next_check_at'=>now()->addMinutes(15),'error'=>'scan_failed']);
            }
        }
        return $ids->count();
    }
    public function scan(string $id): void
    {
        $lease=(string)Str::uuid();
        $claimed=DB::table('agent_signal_watches')->where('id',$id)->where('enabled',true)->where('next_check_at','<=',now())
            ->where(fn($q)=>$q->whereNull('lease_expires_at')->orWhere('lease_expires_at','<=',now()))
            ->update(['lease'=>$lease,'lease_expires_at'=>now()->addMinutes(2)]);
        if (!$claimed) return;
        $w=DB::table('agent_signal_watches')->where('id',$id)->first(); $error=null; $next=null;
        $valid=function()use($id,$lease,$w){
            $fresh=DB::table('agent_signal_watches')->where('id',$id)->where('lease',$lease)->where('revision',$w->revision)->where('lease_expires_at','>',now())->first();
            return $fresh ? app(WatchAuthority::class)->current($fresh) : null;
        };
        try {
            $c=$valid(); if (!$c) $error='access_changed';
            else $next=app(GithubEvidence::class)->read($w->repository,app(Credentials::class)->for($c),$valid);
        } catch (\App\Services\ChatConnectors\ReconnectRequired) { $error='reconnect_required'; }
        catch (\Throwable) { $error='read_unavailable'; }
        DB::transaction(function()use($id,$lease,$w,$next,$error,$valid){
            $fresh=DB::table('agent_signal_watches')->where('id',$id)->where('lease',$lease)->where('revision',$w->revision)->lockForUpdate()->first();
            if (!$fresh) return;
            DB::table('agent_connections')->where('id',$w->connection_id)->lockForUpdate()->first();
            DB::table('agent_grants')->where('id',$w->grant_id)->lockForUpdate()->first();
            if (!$valid()) $error='access_changed';
            $update=['lease'=>null,'lease_expires_at'=>null,'next_check_at'=>now()->addMinutes(15),'last_checked_at'=>now(),'error'=>$error,'updated_at'=>now()];
            if ($error===null && $next!==null) {
                $old=json_decode($w->observations??'{}',true);
                foreach($next as $key=>$fact) if(isset($old[$key]) && strcmp($fact['updatedAt'],$old[$key]['updatedAt'])<0) $next[$key]=$old[$key];
                app(Findings::class)->compare($w,$old,$next);
                // Unknown mergeability preserves previous confirmed value; null cannot resolve a conflict.
                $old=json_decode($w->observations??'{}',true);
                foreach($next as $key=>&$fact) if ($fact['mergeable']===null && isset($old[$key])) $fact['mergeable']=$old[$key]['mergeable'];
                unset($fact); $update['observations']=json_encode($next);
            }
            DB::table('agent_signal_watches')->where('id',$id)->update($update);
        });
    }
}
