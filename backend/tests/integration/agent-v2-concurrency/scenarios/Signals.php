<?php
use App\Models\AgentV2\Run;
use App\Models\AgentWork\Goal;
use App\Services\AgentRuns\Events;
use App\Services\AgentWork\Signals\{Settings,Watches};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
require_once __DIR__.'/../SignalOps.php';
final class ConcSignals
{
    public static function run():void
    {
        Conc::$scenario='Stage 4 Signals'; ConcSignalOps::configure(); $fx=ConcFixture::make(false);
        $connection=ConcFixture::github($fx,['github_list_pull_requests']);
        $goal=Goal::create(['user_id'=>$fx['user'],'agent_id'=>$fx['agent'],'title'=>'Review repository readiness',
            'runtime_binding_id'=>(string)Str::uuid(),'runtime_snapshot'=>[],'expires_at'=>now()->addDay(),
            'milestones'=>[['key'=>'review','title'=>'Review source evidence','successCriteria'=>'Owner confirms result','status'=>'pending']]]);
        $id=(string)Str::uuid(); $body=['expectedRevision'=>0,'agentId'=>$fx['agent'],'connectionId'=>$connection,'repository'=>'octo/app','enabled'=>true,'goalId'=>$goal->id];
        $request=['op'=>'signals','mode'=>'http','method'=>'PUT','uri'=>'/api/agents/v2/signals/watches/'.$id,'token'=>$fx['token'],'json'=>$body];
        $race=Conc::tally(ConcRace::run(array_fill(0,6,$request)));
        Conc::check('six explicit watch saves create one revision under user lock',($race['200']??0)===1 && ($race['409:signals_changed']??0)===5,json_encode($race));
        $old=['7'=>['number'=>7,'state'=>'open','merged'=>false,'draft'=>false,'mergeable'=>true,'updatedAt'=>now()->subHour()->toIso8601String()]];
        DB::table('agent_signal_watches')->where('id',$id)->update(['observations'=>json_encode($old)]);
        $jobs=array_fill(0,6,['op'=>'signals','mode'=>'scan','watch'=>$id]); ConcRace::run($jobs);
        Conc::check('six scans issue one bounded provider read pair and one finding',DB::table('conc_calls')->where('kind','DISCOVERY_READ')->where('ckey',$id)->count()===2
            && DB::table('agent_signal_findings')->where('watch_id',$id)->count()===1);
        Conc::check('explicit goal link is pinned without changing milestone progress',DB::table('agent_signal_findings')->where('watch_id',$id)->value('goal_id')===$goal->id
            && $goal->fresh()->milestones[0]['status']==='pending');
        DB::table('agent_signal_watches')->where('id',$id)->update(['observations'=>json_encode($old),'next_check_at'=>now()]);
        $changing=ConcRace::start([['op'=>'signals','mode'=>'scan','watch'=>$id,'stallMs'=>500]])->release();
        if(!ConcWorkers::awaitInFlight('DISCOVERY_READ',$id))throw new RuntimeException('Goal review fake never entered provider call.');
        app(Watches::class)->save($fx['user'],$id,[...$body,'expectedRevision'=>1,'goalId'=>null]); $changing->results();
        Conc::check('goal unlink during provider read fences stale findings and preserves original context',DB::table('agent_signal_findings')->where('watch_id',$id)->count()===1
            && DB::table('agent_signal_findings')->where('watch_id',$id)->value('goal_id')===$goal->id
            && DB::table('agent_signal_watches')->where('id',$id)->value('goal_id')===null);
        DB::table('agent_signal_watches')->where('id',$id)->update(['observations'=>json_encode($old),'next_check_at'=>now()]);
        $race=ConcRace::start([['op'=>'signals','mode'=>'scan','watch'=>$id,'stallMs'=>500]])->release();
        $flight=ConcWorkers::awaitInFlight('DISCOVERY_READ',$id);
        if(!$flight)throw new RuntimeException('Discovery fake never entered provider call.');
        DB::table('agent_grants')->where('connection_id',$connection)->update(['revoked_at'=>now()]); $race->results();
        Conc::check('grant revocation during read fences final finding commit',DB::table('agent_signal_findings')->where('watch_id',$id)->count()===1
            && DB::table('agent_signal_watches')->where('id',$id)->value('error')==='access_changed');
        $settings=app(Settings::class); $p=$settings->preferences($fx['user']);
        $pref=['expectedRevision'=>$p['revision'],'mode'=>'daily','timezone'=>'UTC','quietStart'=>null,'quietEnd'=>null,'digestMinute'=>0];
        $race=Conc::tally(ConcRace::run(array_fill(0,6,['op'=>'signals','mode'=>'http','method'=>'PUT','uri'=>'/api/agents/v2/signals/preferences','token'=>$fx['token'],'json'=>$pref])));
        Conc::check('notification preference CAS has one winner',($race['200']??0)===1 && ($race['409:signals_changed']??0)===5,json_encode($race));
        $r=Run::find(ConcFixture::admit($fx,'Synthetic digest source.')['id']); $r->forceFill(['state'=>'completed','answer'=>'Fixture','finished_at'=>now()])->save();
        app(Events::class)->append($r,'run.completed');
        DB::table('agent_signal_digest_items')->where('user_id',$fx['user'])->update(['due_date'=>now()->subDay()->toDateString()]);
        $results=ConcRace::run(array_fill(0,6,['op'=>'signals','mode'=>'digest','user'=>$fx['user']]));
        Conc::check('six daily scanners publish one digest and canonical inbox item',DB::table('agent_signal_digests')->where('user_id',$fx['user'])->count()===1
            && DB::table('work_events')->where('user_id',$fx['user'])->where('source','agent_digest')->count()===1,json_encode($results));
        Conc::check('discovery never admitted a task or performed provider writes',DB::table('agent_runs')->where('user_id',$fx['user'])->count()===1
            && DB::table('agent_tool_actions')->where('user_id',$fx['user'])->count()===0);
    }
}
