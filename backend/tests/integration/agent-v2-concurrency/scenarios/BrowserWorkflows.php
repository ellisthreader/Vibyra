<?php
use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class ConcBrowserWorkflows
{
    public static function run(): void
    {
        Conc::$scenario='Stage 6 taught workflow';$fx=ConcFixture::make(false);DB::table('users')->where('id',$fx['user'])->update(['plan'=>'pro','membership_ends_at'=>now()->addDay()]);
        $fx['runtime']=ConcFixture::ok(ConcHttp::call('POST','/api/agents/v2/runtimes',$fx['token'],['hostId'=>$fx['hostId'],'provider'=>'claude','accountRef'=>'default','model'=>'sonnet',
            'capabilities'=>['controlledTools'=>true,'browserTools'=>true,'browserWorkflowsV1'=>true,'pinnedSkillsV1'=>true,'parallelJobsV1'=>true,'workerSlots'=>3]]),201)['runtime'];
        $route='/api/agents/v2/agents/'.$fx['agent'].'/browser';$state=ConcFixture::ok(ConcHttp::call('GET',$route,$fx['token']),200);
        $connection=ConcFixture::ok(ConcHttp::call('PUT',$route,$fx['token'],['origins'=>['https://shop.example.com'],'expectedRevision'=>$state['revision'],'expectedConnectionId'=>null,'expectedGeneration'=>0]),200)['browser']['connectionId'];
        $source=ConcFixture::admit($fx,'Teach a public fixture.');ConcFixture::ok(ConcHttp::call('POST','/api/agents/v2/runs/'.$source['id'].'/cancel',$fx['token']),200);
        $step=['operation'=>'type','parameter'=>'input1','target'=>['origin'=>'https://shop.example.com','path'=>'/contact','role'=>'textbox','name'=>'To','inputType'=>'email']];
        $w=ConcFixture::ok(ConcHttp::call('POST','/api/agents/v2/browser-workflows',$fx['token'],['id'=>(string)Str::uuid(),'sourceRunId'=>$source['id'],'name'=>'PG procedure','steps'=>[$step]]),201)['workflow'];
        $path='/api/agents/v2/browser-workflows/'.$w['id'];$review=['expectedRevision'=>1,'reviewHash'=>$w['reviewHash']];
        $start=[...$review,'requestId'=>(string)Str::uuid(),'inputs'=>['input1'=>'fixture@example.invalid']];
        $race=Conc::tally(ConcRace::run(array_fill(0,6,self::job($fx,$path.'/test',$start))));
        Conc::check('six identical test starts create one immutable test context',($race['200']??0)===6&&DB::table('agent_browser_workflow_tests')->where('workflow_id',$w['id'])->count()===1,json_encode($race));
        $run=ConcFixture::ok(ConcHttp::runner($fx,'POST','/claim',['workerSlot'=>0]),200)['run'];
        $fp=str_repeat('b',64);$page=['url'=>'https://shop.example.com/contact','title'=>'Fixture','pageFingerprint'=>$fp,'elements'=>[['ref'=>'e1','role'=>'textbox','name'=>'To']],'forms'=>[]];
        self::perform($fx,$run,$connection,'browser_open',['url'=>'https://shop.example.com/contact'],'open',$page);
        self::perform($fx,$run,$connection,'browser_resolve',$step['target'],'resolve',[...$page,'resolvedRef'=>'e1']);
        self::perform($fx,$run,$connection,'browser_type',['ref'=>'e1','text'=>'fixture@example.invalid'],'type',$page);
        ConcFixture::ok(ConcHttp::runner($fx,'POST','/runs/'.$run['id'].'/complete',['generation'=>$run['generation'],'answer'=>'Actual fixture receipts completed.']),200);
        $got=ConcFixture::ok(ConcHttp::call('GET',$path,$fx['token']),200);
        Conc::check('actual leased browser receipts establish passed procedure',$got['workflow']['testState']==='passed');
        $race=Conc::tally(ConcRace::run(array_fill(0,6,self::job($fx,$path.'/save',$review))));
        $skill=DB::table('agent_browser_workflows')->where('id',$w['id'])->value('skill_id');
        Conc::check('six save replays assign exactly one tested skill',($race['200']??0)===6&&$skill&&DB::table('agent_skills')->where('user_id',$fx['user'])->count()===1,json_encode($race));
        $no=ConcHttp::call('PUT',$path,$fx['token'],['expectedRevision'=>1,'name'=>'Changed after save','steps'=>[$step]]);
        Conc::check('published tested version cannot be silently edited',$no['status']===409);
        Conc::check('workflow races have no deadlock',ConcPg::count('deadlock detected')===0);
    }
    private static function job(array $fx,string $uri,array $body): array{return ['op'=>'call','method'=>'POST','uri'=>$uri,'token'=>$fx['token'],'json'=>$body];}
    private static function perform(array $fx,array $run,string $connection,string $tool,array $args,string $call,array $result): void
    {
        $action=ConcFixture::ok(ConcHttp::runner($fx,'POST','/runs/'.$run['id'].'/tools',['generation'=>$run['generation'],'callId'=>$call,'tool'=>$tool,'connectionId'=>$connection,
            'schemaRevision'=>app(ToolCatalog::class)->schemaRevision($tool),'arguments'=>$args]),200)['action'];
        $path='/runs/'.$run['id'].'/browser/'.$action['id'];$fingerprint=ToolAction::findOrFail($action['id'])->fingerprint;
        ConcFixture::ok(ConcHttp::runner($fx,'POST',$path.'/claim',['generation'=>$run['generation'],'fingerprint'=>$fingerprint]),200);
        ConcFixture::ok(ConcHttp::runner($fx,'POST',$path.'/receipt',['generation'=>$run['generation'],'result'=>$result]),200);
    }
}
