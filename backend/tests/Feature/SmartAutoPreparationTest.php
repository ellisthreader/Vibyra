<?php
namespace Tests\Feature;
use App\Jobs\ClassifyDecision;
use App\Models\{User,VibyraSession};
use App\Services\Decisions\{Preparations,JevClient,Questions};
use App\Services\Notifications\Preferences;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache,Crypt,DB,Http,Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;
final class SmartAutoPreparationTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    protected function setUp(): void
    {
        parent::setUp(); Queue::fake(); Http::preventStrayRequests(); Cache::flush();
        config(['vibes.enabled'=>true,'services.openrouter.key'=>'test-only','intelligence.jev_mode'=>'active',
            'intelligence.auto_work'=>true,'intelligence.jev_key'=>'fixture','app.key'=>'base64:'.base64_encode(str_repeat('x',32))]);
        VibesCatalogue::put(); $this->user=User::factory()->create(['email_verified_at'=>now()]);
        VibyraSession::create(['user_id'=>$this->user->id,'token_hash'=>hash('sha256','smart-test')]);
        $this->withToken('smart-test'); $this->getJson('/api/vibes/wallet')->assertOk();
        app(Wallet::class)->grant($this->user->id,'test-topup','topup',500);
        $this->postJson('/api/vibes/consent',['accepted'=>true])->assertOk();
        app(Preferences::class)->get($this->user->id);
        DB::table('notification_preferences')->where('user_id',$this->user->id)->update(['smart'=>true]);
    }
    private function quote(string $model='auto'): array
    {
        $chat=(string)Str::uuid();$this->postJson('/api/vibes/chats',['id'=>$chat,'title'=>'Test'])->assertOk();
        return $this->postJson('/api/vibes/quote',['chatId'=>$chat,'text'=>'write a short greeting','model'=>$model])->assertOk()->json();
    }
    public function test_typing_never_calls_provider_and_timeout_freezes_one_fallback(): void
    {
        $q=$this->quote();Http::assertNothingSent();$id=(string)Str::uuid();$p=app(Preparations::class);
        $p->start($this->user->id,$id,$q['quote']);$p->start($this->user->id,$id,$q['quote']);
        $this->assertDatabaseCount('ai_decisions',1);$this->assertSame('pending',$p->status($this->user->id,$id)['state']);
        $this->travel(3)->seconds();$final=$p->status($this->user->id,$id);
        app()->call([new ClassifyDecision($id),'handle']);Http::assertNothingSent();
        $this->assertSame($final,$p->status($this->user->id,$id));$this->assertSame($q['model'],$final['quote']['model']);
        $this->assertSame($q['effort'],$final['quote']['effort']);
        $this->assertNull(DB::table('ai_decisions')->where('id',$id)->value('input'));
    }
    public function test_manual_selection_and_disabled_feature_never_start_inference(): void
    {
        $q=$this->quote('anthropic/claude-opus-5');
        $this->postJson('/api/vibes/auto-preparations',['id'=>(string)Str::uuid(),'quote'=>$q['quote']])->assertStatus(422);
        $q=$this->quote();config(['intelligence.auto_work'=>false]);
        $this->postJson('/api/vibes/auto-preparations',['id'=>(string)Str::uuid(),'quote'=>$q['quote']])->assertStatus(409);
        Http::assertNothingSent();$this->assertDatabaseCount('ai_decisions',0);
    }
    public function test_context_change_blocks_prepared_quote(): void
    {
        $q=$this->quote();$id=(string)Str::uuid();app(Preparations::class)->start($this->user->id,$id,$q['quote']);
        DB::table('vibes_chats')->where('user_id',$this->user->id)->increment('revision');$this->travel(3)->seconds();
        $this->getJson('/api/vibes/auto-preparations/'.$id)->assertStatus(409);
    }
    public function test_provider_schema_is_checked_and_no_retry_is_made(): void
    {
        $questions=Questions::progress();
        Http::fake(['*'=>Http::response(['model'=>config('intelligence.jev_served_model'),
            'answers'=>['progress'=>['type'=>'choice','choice'=>'possible_loop','confidence'=>.99,
                'probabilities'=>['normal'=>.8,'possible_loop'=>.8,'possible_blocker'=>.1,'insufficient_evidence'=>.1]]], 'usage'=>['cost'=>.0001]])]);
        try {app(JevClient::class)->decide(['attempts'=>[]],$questions);$this->fail('Invalid distribution accepted');}
        catch (\RuntimeException $e) {$this->assertSame('decision_unavailable',$e->getMessage());}
        Http::assertSentCount(1);$this->assertTrue(Cache::has('jev:circuit'));
    }
    public function test_late_and_consent_revoked_jobs_cannot_change_preparation(): void
    {
        $q=$this->quote();$id=(string)Str::uuid();$p=app(Preparations::class);$p->start($this->user->id,$id,$q['quote']);
        DB::table('notification_preferences')->where('user_id',$this->user->id)->update(['smart'=>false]);
        app()->call([new ClassifyDecision($id),'handle']);Http::assertNothingSent();
        $this->assertSame('ready',$p->status($this->user->id,$id)['state']);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'ready','reason'=>'local_fallback']);
    }
    public function test_valid_classification_is_frozen_in_a_fresh_quote(): void
    {
        $q=$this->quote();$id=(string)Str::uuid();$p=app(Preparations::class);$p->start($this->user->id,$id,$q['quote']);
        $answers=[];
        foreach(Questions::routing() as $name=>$question) {
            $choice=['capability'=>'demanding','deliberation'=>'substantial','specialty'=>'code'][$name];
            $probabilities=array_fill_keys(array_keys($question['criteria']),0);$probabilities[$choice]=1;
            $answers[$name]=['type'=>'choice','choice'=>$choice,'confidence'=>1,'probabilities'=>$probabilities];
        }
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response(['data'=>['limit'=>5,'limit_remaining'=>5,'limit_reset'=>null,
            'include_byok_in_limit'=>true,'is_management_key'=>false,'is_provisioning_key'=>false]]),
            'https://openrouter.ai/api/alpha/decisions'=>Http::response(['model'=>config('intelligence.jev_served_model'),'answers'=>$answers,'usage'=>['cost'=>.0001]])]);
        app()->call([new ClassifyDecision($id),'handle']);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'classified','usage_micro_usd'=>100]);
        $final=$p->status($this->user->id,$id);$this->assertSame('ready',$final['state']);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'ready','reason'=>null]);
        $this->assertSame($final,$p->status($this->user->id,$id));Http::assertSentCount(2);
    }
}
