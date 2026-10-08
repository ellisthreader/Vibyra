<?php
namespace App\Services\AgentWork\Signals;
use App\Models\AgentV2\RunEvent;
use Illuminate\Support\Facades\DB;
final class ProgressAlerts
{
    private const STATES=[
        'running'=>['agent_progress','replies','started','progress'],
        'waiting_for_computer'=>['agent_blocked','attention','needs its computer','blocked'],
        'paused_by_limits'=>['agent_blocked','attention','reached a limit','blocked'],
        'outcome_unknown'=>['agent_blocked','attention','needs an outcome check','blocked'],
        'cancelled'=>['agent_cancelled','replies','was cancelled','cancelled'],
    ];
    public function record(RunEvent $event): void
    {
        if(!Settings::enabled() || !\App\Services\Notifications\AgentRunNotifications::enabled() || !in_array($event->type,['run.state','run.admitted'],true)) return;
        $to=$event->type==='run.admitted'?($event->payload['state']??null):($event->payload['to']??null);
        if($event->type==='run.admitted' && $to!=='waiting_for_computer')return; if(!isset(self::STATES[$to]))return;
        // Completing a read tool returns to running; it is not another task start.
        if($to==='running' && ($event->payload['from']??null)!=='starting')return;
        $run=DB::table('agent_runs')->where('id',$event->run_id)->first(); if(!$run)return;
        [$phase,$category,$words,$kind]=self::STATES[$to];
        $name=DB::table('agent_teammates')->where('id',$run->agent_id)->where('user_id',$run->user_id)->value('name');
        $name=mb_substr(preg_replace('/[\x00-\x1f\x7f]/u','',(string)$name),0,50);
        app(Publisher::class)->item($run->user_id,hash('sha256','agent_progress:'.$run->id.':'.$event->seq),'agent_run',$run->id,
            $phase,$category,($name?:'Your teammate').' '.$words,
            ['source'=>'agent_run','runId'=>$run->id,'agentId'=>$run->agent_id,'conversationId'=>$run->conversation_id,'kind'=>$kind],
            ['seq'=>$event->seq,'kind'=>$kind,'state'=>$to]);
    }
    public function current(object $item,object $event): bool
    {
        if(!Settings::enabled())return false;
        $state=json_decode($event->metadata,true)['state']??null;
        return is_string($state) && DB::table('agent_runs')->where('id',$event->run_id)->where('user_id',$item->user_id)->where('state',$state)->exists();
    }
}
