<?php
namespace Tests\Support;
use Illuminate\Support\Str;
trait BrowserWorkflowFixture
{
    use AgentV2Fixture,AgentV2Routes,AgentV2BrowserFixture;
    protected string $connection;
    protected function bootWorkflow(): void
    {
        $this->bootV2();$this->connection=$this->bootBrowser();
        config(['agents_v2.browser_workflows_enabled'=>true,'agents_v2.parallel_jobs_enabled'=>true]);
        $this->runtime=$this->postJson('/api/agents/v2/runtimes',['hostId'=>$this->hostId,'provider'=>'claude','accountRef'=>'default','model'=>'claude-sonnet',
            'capabilities'=>['controlledTools'=>true,'pinnedSkillsV1'=>true,'browserTools'=>true,'browserWorkflowsV1'=>true,'parallelJobsV1'=>true,'workerSlots'=>3]])->assertCreated()->json('runtime');
    }
    protected function claim(): array{return $this->postJson($this->runnerPath('/claim'),['workerSlot'=>0],$this->runnerHeaders())->assertOk()->json('run');}
    protected function draft(string $operation='type'): array
    {
        $source=$this->admit('Teach a public browser procedure.');$this->postJson('/api/agents/v2/runs/'.$source['id'].'/cancel')->assertOk();
        $step=$operation==='type'?['operation'=>'type','parameter'=>'input1','target'=>['origin'=>'https://shop.example.com','path'=>'/contact','role'=>'textbox','name'=>'To','inputType'=>'email']]
            :['operation'=>'submit','target'=>['origin'=>'https://shop.example.com','path'=>'/contact','role'=>'button','name'=>'Send','inputType'=>'submit']];
        return $this->postJson('/api/agents/v2/browser-workflows',['id'=>(string)Str::uuid(),'sourceRunId'=>$source['id'],'name'=>'Fixture procedure','steps'=>[$step]])->assertCreated()->json('workflow');
    }
    protected function review(array $w): array{return ['expectedRevision'=>$w['revision'],'reviewHash'=>$w['reviewHash']];}
    protected function start(array $w,?string $key=null)
    {return $this->postJson('/api/agents/v2/browser-workflows/'.$w['id'].'/test',[...$this->review($w),'requestId'=>$key??(string)Str::uuid(),'inputs'=>$w['parameters']?['input1'=>'fresh@example.com']:[]]);}
    protected function opened(array $w): array
    {
        $this->start($w)->assertOk();$run=$this->claim();$fp=str_repeat('b',64);
        $open=$this->callTool($run,'browser_open',$this->connection,['url'=>'https://shop.example.com/contact'],'open')->assertOk()->json('action');
        $this->browserRun($run,$open,$this->page($fp))->assertOk();
        $resolve=$this->callTool($run,'browser_resolve',$this->connection,$w['steps'][0]['target'],'resolve')->assertOk()->json('action');
        $this->browserRun($run,$resolve,[...$this->page($fp),'resolvedRef'=>$w['steps'][0]['operation']==='submit'?'e3':'e1'])->assertOk();return $run;
    }
    protected function typed(array $run): array
    {
        $a=$this->callTool($run,'browser_type',$this->connection,['ref'=>'e1','text'=>'fresh@example.com'],'type')->assertOk()->json('action');
        $this->browserRun($run,$a,$this->page(str_repeat('b',64),'fresh@example.com'))->assertOk();return $a;
    }
}
