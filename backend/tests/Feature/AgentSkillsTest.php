<?php
namespace Tests\Feature;
use App\Models\User;
use App\Services\Agents\{Skills, Teammates};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
class AgentSkillsTest extends TestCase
{
    use RefreshDatabase;
    private function account(): User { $u = User::factory()->create(); app(Wallet::class)->ensure($u); return $u; }
    private function agent(User $u): array { return app(Teammates::class)->save($u->id, ['id'=>(string) Str::uuid(), 'name'=>'Reviewer','brief'=>'Review code','memory'=>'','avatar'=>'review','budget'=>10,'integrations'=>[]]); }
    public function test_save_retry_does_not_double_apply_revisions_and_instructions_are_assigned(): void
    {
        $u=$this->account(); $agent=$this->agent($u); $service=app(Skills::class);
        $data=['id'=>(string) Str::uuid(),'revision'=>0,'name'=>'Style','instructions'=>'Use plain language.','teammateIds'=>[$agent['id']]];
        $first=$service->save($u->id,$data); $second=$service->save($u->id,$data);
        $this->assertSame($first['revision'],$second['revision']);
        $record=DB::table('agent_teammates')->where('id',$agent['id'])->first();
        $this->assertSame($agent['revision']+1,$record->revision);
        $this->assertStringContainsString('Use plain language.', Skills::prompt($record));
        $this->assertSame([],json_decode($record->integrations,true));
        $this->assertSame([], $service->list($this->account()->id));
        $service->save($u->id,[...$data,'revision'=>1,'teammateIds'=>[]]);
        $this->assertSame('',Skills::prompt($record));
    }
    public function test_library_skill_can_be_selected_during_profile_creation_and_supplies_instructions(): void
    {
        $u = $this->account();
        $skill = app(Skills::class)->save($u->id, ['id'=>(string) Str::uuid(), 'revision'=>0,
            'name'=>'Source review', 'instructions'=>'Check claims against original sources.', 'teammateIds'=>[]]);
        $a = app(Teammates::class)->save($u->id, ['id'=>(string) Str::uuid(), 'name'=>'Reviewer',
            'brief'=>'Review reports', 'avatar'=>'review', 'budget'=>10, 'integrations'=>[], 'skillIds'=>[$skill['id']]]);
        $this->assertSame([$skill['id']], $a['skillIds']);
        $record = DB::table('agent_teammates')->where('id', $a['id'])->first();
        $this->assertStringContainsString('Check claims against original sources.', Skills::prompt($record));
        $this->assertSame([], json_decode($record->integrations, true));
    }

    public function test_cannot_assign_another_accounts_teammate(): void
    {
        $u=$this->account();$other=$this->agent($this->account());
        try { app(Skills::class)->save($u->id,['id'=>(string) Str::uuid(),'revision'=>0,'name'=>'Test','instructions'=>'Instructions','teammateIds'=>[$other['id']]]); $this->fail('Foreign assignment accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(404,$e->getStatusCode()); }
        $this->assertSame(0,DB::table('agent_skills')->count());
    }
    public function test_stale_revision_does_not_replace_instructions(): void
    {
        $u=$this->account();$data=['id'=>(string)Str::uuid(),'revision'=>0,'name'=>'Test','instructions'=>'Original','teammateIds'=>[]];
        app(Skills::class)->save($u->id,$data);
        try {app(Skills::class)->save($u->id,[...$data,'instructions'=>'Stale']);$this->fail('Stale save accepted');}
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {$this->assertSame(409,$e->getStatusCode());}
        $this->assertSame('Original',DB::table('agent_skills')->value('instructions'));
    }
}
