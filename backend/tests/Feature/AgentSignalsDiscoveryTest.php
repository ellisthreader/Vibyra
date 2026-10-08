<?php
namespace Tests\Feature;
use App\Services\AgentWork\Signals\{Discovery,Findings,Watches,Onboarding};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB,Http};
use Tests\Support\{AgentV2Fixture,AgentSignalsFixture};
use Tests\TestCase;
class AgentSignalsDiscoveryTest extends TestCase
{
    use RefreshDatabase,AgentV2Fixture,AgentSignalsFixture;
    protected function setUp():void { parent::setUp(); $this->signalsBoot(); }
    public function test_baseline_is_silent_then_real_conflict_and_resolution_are_deduplicated():void
    {
        $w=$this->watch(); $this->fakePr($this->fact()); app(Discovery::class)->scan($w['id']);
        $this->assertDatabaseCount('agent_signal_findings',0);
        $this->travel(20)->minutes(); $this->fakePr($this->fact(['mergeable'=>false])); $this->scanAgain($w['id']);
        $f=app(Findings::class)->list($this->user->id,$this->agent['id']);
        $this->assertCount(1,$f,json_encode(DB::table('agent_signal_watches')->where('id',$w['id'])->first())); $this->assertSame('merge_conflict',$f[0]['kind']); $this->assertTrue($f[0]['fresh']);
        $this->assertSame('https://github.com/fixture/repo/pull/7',$f[0]['source']['url']);
        $this->assertStringNotContainsString('UNTRUSTED',json_encode($f)); $this->assertStringNotContainsString('attacker',json_encode($f));
        $this->scanAgain($w['id']); $this->assertDatabaseCount('agent_signal_findings',1);
        $this->fakePr($this->fact(['mergeable'=>null])); $this->scanAgain($w['id']); $this->assertDatabaseCount('agent_signal_findings',1);
        $this->travel(1)->minute(); $this->fakePr($this->fact(['mergeable'=>true])); $this->scanAgain($w['id']);
        $this->assertDatabaseHas('agent_signal_findings',['kind'=>'conflict_resolved']);
        $this->assertDatabaseCount('agent_runs',0); $this->assertDatabaseCount('agent_schedules',0);
    }
    public function test_revocation_during_provider_read_prevents_findings_and_replacement_requires_review():void
    {
        $c=$this->github(); $w=$this->watch($c); $this->fakePr($this->fact()); $this->scanAgain($w['id']);
        $this->fakePr($this->fact(['mergeable'=>false]),fn()=>DB::table('agent_connections')->where('id',$c)->update(['generation'=>2]));
        $this->scanAgain($w['id']); $this->assertDatabaseCount('agent_signal_findings',0);
        $this->assertSame('needs_review',app(Watches::class)->list($this->user->id,$this->agent['id'])[0]['status']);
        $this->assertDatabaseHas('agent_signal_watches',['id'=>$w['id'],'error'=>'access_changed']);
    }
    public function test_disabled_or_ungranted_watch_never_reads_and_wrong_repository_is_not_evidence():void
    {
        $w=$this->watch(); config(['agents_v2.work_enabled'=>false]); $this->assertSame(0,app(Discovery::class)->tick()); Http::assertNothingSent();
        config(['agents_v2.work_enabled'=>true]); $this->fakePr($this->fact(['base'=>['repo'=>['full_name'=>'other/repo']]]));
        $this->scanAgain($w['id']); $this->assertDatabaseHas('agent_signal_watches',['id'=>$w['id'],'observations'=>null,'error'=>'read_unavailable']);
        DB::table('agent_grants')->where('agent_id',$this->agent['id'])->update(['revoked_at'=>now()]);
        $this->scanAgain($w['id']); $this->assertDatabaseCount('agent_signal_findings',0);
    }
    public function test_status_changes_have_source_evidence_and_dismissal_is_owner_only():void
    {
        $w=$this->watch(); $this->fakePr($this->fact()); $this->scanAgain($w['id']);
        $this->travel(1)->minute(); $this->fakePr($this->fact(['state'=>'closed','merged'=>true])); $this->scanAgain($w['id']);
        $f=app(Findings::class)->list($this->user->id,$this->agent['id'])[0]; $this->assertSame('status_changed',$f['kind']);
        app(Findings::class)->dismiss($this->user->id,$f['id']); $this->assertSame([],app(Findings::class)->list($this->user->id,$this->agent['id']));
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class); app(Findings::class)->dismiss($this->user->id+1,$f['id']);
    }
    public function test_onboarding_requires_stated_interest_and_exact_read_access_without_implicit_actions():void
    {
        $service=app(Onboarding::class); $this->assertSame([],$service->payload($this->user->id,$this->agent['id'])['suggestions']);
        $d=['expectedRevision'=>0,'agentId'=>$this->agent['id'],'interests'=>['code'],'dismissed'=>false];
        $p=$service->save($this->user->id,$d); $this->assertFalse($p['suggestions'][0]['ready']);
        $this->watch(); $p=$service->payload($this->user->id,$this->agent['id']);
        $this->assertTrue($p['suggestions'][0]['ready']); $this->assertTrue($p['suggestions'][0]['firstTask']['readOnly']);
        $service->save($this->user->id,array_replace($d,['expectedRevision'=>1,'dismissed'=>true]));
        $this->assertSame([],$service->payload($this->user->id,$this->agent['id'])['suggestions']);
        $this->assertDatabaseCount('agent_runs',0); $this->assertDatabaseCount('agent_schedules',0);
    }
}
