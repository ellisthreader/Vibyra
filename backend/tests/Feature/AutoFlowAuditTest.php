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
final class AutoFlowAuditTest extends TestCase
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
    private function provider(): void
    {
        $answers=[];
        foreach (Questions::routing() as $name=>$q) {
            $choice=['capability'=>'demanding','deliberation'=>'substantial','specialty'=>'code'][$name];
            $probabilities=array_fill_keys(array_keys($q['criteria']),0); $probabilities[$choice]=1;
            $answers[$name]=['type'=>'choice','choice'=>$choice,'confidence'=>1,'probabilities'=>$probabilities];
        }
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response(['data'=>['limit'=>5,'limit_remaining'=>5,
            'limit_reset'=>null,'include_byok_in_limit'=>true,'is_management_key'=>false,'is_provisioning_key'=>false]]),
            'https://openrouter.ai/api/alpha/decisions'=>Http::response(['model'=>config('intelligence.jev_served_model'),
                'answers'=>$answers,'usage'=>['cost'=>.0001]])]);
    }
    public function test_prepared_quote_submits_exactly_once_without_second_classification(): void
    {
        $this->provider(); $q=$this->quote(); $id=(string) Str::uuid(); $p=app(Preparations::class);
        $p->start($this->user->id,$id,$q['quote']); app()->call([new ClassifyDecision($id),'handle']);
        $final=$p->status($this->user->id,$id)['quote'];
        $decoded=app(\App\Services\Vibes\Quotes::class)->decode($final['quote'],$this->user->id);
        $turn=(string)Str::uuid();
        $this->postJson('/api/vibes/turns',['id'=>$turn,'quote'=>$final['quote']])->assertSuccessful();
        $held=DB::table('vibes_grants')->where('user_id',$this->user->id)->sum('remaining');
        $this->postJson('/api/vibes/turns',['id'=>$turn,'quote'=>$final['quote']])->assertSuccessful();
        $this->assertDatabaseCount('vibes_turns',1); $this->assertDatabaseCount('ai_decisions',1);
        $stored=DB::table('vibes_turns')->first();
        $this->assertSame($decoded['request'],json_decode($stored->request,true));
        $this->assertSame($decoded['max'],$stored->reserved);
        $this->assertEquals($held,DB::table('vibes_grants')->where('user_id',$this->user->id)->sum('remaining'));
        Http::assertSentCount(2);
    }
    public function test_preparation_and_quote_cannot_cross_accounts(): void
    {
        $q=$this->quote(); $id=(string)Str::uuid(); app(Preparations::class)->start($this->user->id,$id,$q['quote']);
        $other=User::factory()->create(['email_verified_at'=>now()]);
        VibyraSession::create(['user_id'=>$other->id,'token_hash'=>hash('sha256','other-auto-test')]);
        $this->withToken('other-auto-test')->getJson('/api/vibes/auto-preparations/'.$id)->assertNotFound();
        $this->postJson('/api/vibes/auto-preparations',['id'=>$id,'quote'=>$q['quote']])->assertStatus(403);
        Http::assertNothingSent();
    }
    public function test_personal_context_change_requires_fresh_preparation(): void
    {
        $q=$this->quote(); $id=(string)Str::uuid(); $p=app(Preparations::class); $p->start($this->user->id,$id,$q['quote']);
        $this->postJson('/api/vibes/preferences',['style'=>'detailed'])->assertOk(); $this->travel(3)->seconds();
        $this->getJson('/api/vibes/auto-preparations/'.$id)->assertStatus(409); Http::assertNothingSent();
    }
    public function test_revoked_wallet_consent_blocks_execution_of_a_ready_preparation(): void
    {
        $q=$this->quote(); $id=(string)Str::uuid(); $p=app(Preparations::class); $p->start($this->user->id,$id,$q['quote']);
        $this->travel(3)->seconds(); $final=$p->status($this->user->id,$id)['quote'];
        DB::table('vibes_wallets')->where('user_id',$this->user->id)->update(['consented_at'=>null]);
        $this->postJson('/api/vibes/turns',['id'=>(string)Str::uuid(),'quote'=>$final['quote']])->assertStatus(403);
        $this->assertDatabaseCount('vibes_turns',0); Http::assertNothingSent();
    }
    public function test_surface_kill_switch_stops_already_queued_inference(): void
    {
        $this->provider(); $q=$this->quote(); $id=(string)Str::uuid(); app(Preparations::class)->start($this->user->id,$id,$q['quote']);
        config(['intelligence.auto_work'=>false]); app()->call([new ClassifyDecision($id),'handle']);
        Http::assertNothingSent();
    }
    public function test_stale_conversation_is_rejected_before_spending_on_classification(): void
    {
        $q=$this->quote(); DB::table('vibes_chats')->where('user_id',$this->user->id)->increment('revision');
        $this->postJson('/api/vibes/auto-preparations',['id'=>(string)Str::uuid(),'quote'=>$q['quote']])->assertStatus(409);
        $this->assertDatabaseCount('ai_decisions',0); Http::assertNothingSent();
    }
    public function test_stale_personal_context_is_rejected_before_classification(): void
    {
        $q=$this->quote(); $this->postJson('/api/vibes/preferences',['style'=>'detailed'])->assertOk();
        $this->postJson('/api/vibes/auto-preparations',['id'=>(string)Str::uuid(),'quote'=>$q['quote']])->assertStatus(409);
        $this->assertDatabaseCount('ai_decisions',0); Http::assertNothingSent();
    }
    public function test_context_changed_in_queue_is_rejected_before_provider_call(): void
    {
        $this->provider(); $q=$this->quote(); $id=(string)Str::uuid(); app(Preparations::class)->start($this->user->id,$id,$q['quote']);
        DB::table('vibes_chats')->where('user_id',$this->user->id)->increment('revision');
        app()->call([new ClassifyDecision($id),'handle']); Http::assertNothingSent();
        $this->assertDatabaseMissing('decision_spend_buckets',['id'=>'lifetime']);
    }

}
