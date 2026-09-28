<?php
namespace Tests\Feature;
use App\Jobs\ClassifyDecision;
use App\Models\User;
use App\Services\Decisions\{JevClient, Questions};
use App\Services\Notifications\Preferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Crypt, DB, Http};
use Illuminate\Support\Str;
use Tests\TestCase;
final class JevSecurityAuditTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp(); Cache::flush(); Http::preventStrayRequests();
        config(['intelligence.jev_mode'=>'active','intelligence.progress_mode'=>'advisory','intelligence.jev_key'=>'audit-fixture-only',
            'services.openrouter.key'=>'separate-fixture-only']);
    }
    private function decision(): string
    {
        $user=User::factory()->create(); app(Preferences::class)->get($user->id);
        DB::table('notification_preferences')->where('user_id',$user->id)->update(['smart'=>true]);
        $id=(string)Str::uuid();
        DB::table('ai_decisions')->insert(['id'=>$id,'user_id'=>$user->id,'purpose'=>'progress',
            'fingerprint'=>hash('sha256',$id),'input'=>Crypt::encryptString(json_encode(['state'=>['attempts'=>[]]])),
            'deadline'=>now()->addMinute(),'created_at'=>now(),'updated_at'=>now()]);
        return $id;
    }
    private function policy(): array
    {
        return ['data'=>['limit'=>5,'limit_remaining'=>5,'limit_reset'=>null,
            'include_byok_in_limit'=>true,'is_management_key'=>false,'is_provisioning_key'=>false]];
    }
    private function response(): array
    {
        return ['model'=>config('intelligence.jev_served_model'),'usage'=>['cost'=>.0001],
            'answers'=>['progress'=>['type'=>'choice','choice'=>'possible_loop','confidence'=>1,
                'probabilities'=>['normal'=>0,'possible_loop'=>1,'possible_blocker'=>0,'insufficient_evidence'=>0]]]];
    }
    public function test_disabled_job_never_reserves_or_calls_provider(): void
    {
        $id=$this->decision(); config(['intelligence.jev_mode'=>'off']);
        app()->call([new ClassifyDecision($id),'handle']); Http::assertNothingSent();
        $this->assertDatabaseCount('decision_spend_buckets',0);
    }
    public function test_oversized_state_and_open_circuit_never_call_provider(): void
    {
        foreach ([['text'=>str_repeat('a',12001)],[]] as $state) {
            if (!$state) Cache::put('jev:circuit',true,30);
            try {app(JevClient::class)->decide($state,Questions::progress());$this->fail('Unexpected inference');}
            catch (\RuntimeException $e) {$this->assertContains($e->getMessage(),['input_limit','provider_unavailable']);}
        }
        Http::assertNothingSent();
    }
    public function test_provider_redirect_never_follows_untrusted_destination(): void
    {
        Http::fake(['https://openrouter.ai/api/alpha/decisions'=>Http::response('',302,['Location'=>'https://untrusted.test/collect'])]);
        try {app(JevClient::class)->decide([],Questions::progress());$this->fail('Redirect accepted');}
        catch (\RuntimeException $e) {$this->assertSame('decision_unavailable',$e->getMessage());}
        Http::assertSentCount(1);
        Http::assertSent(fn($r)=>$r->url()==='https://openrouter.ai/api/alpha/decisions');
    }
    public function test_billable_invalid_answer_still_trips_unexpected_price_stop(): void
    {
        $id=$this->decision();$body=$this->response();$body['usage']['cost']=.1;
        $body['answers']['progress']['choice']='unrecognized-provider-answer';
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy()),
            'https://openrouter.ai/api/alpha/decisions'=>Http::response($body)]);
        app()->call([new ClassifyDecision($id),'handle']);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'fallback']);
        $this->assertTrue((bool)DB::table('decision_spend_controls')->value('tripped'),
            'Paid malformed responses must retain usage and trip the price stop.');
    }
    public function test_unpriced_provider_response_trips_spending_until_reconciled(): void
    {
        $id=$this->decision();$body=$this->response();unset($body['usage']);
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy()),
            'https://openrouter.ai/api/alpha/decisions'=>Http::response($body)]);
        app()->call([new ClassifyDecision($id),'handle']);
        $this->assertTrue((bool)DB::table('decision_spend_controls')->value('tripped'),
            'An unpriced billable response cannot establish that the $0.001 reservation covered cost.');
    }
    public function test_revoked_consent_during_policy_check_blocks_task_export(): void
    {
        $id=$this->decision();
        Http::fake(['https://openrouter.ai/api/v1/key'=>function () {
            DB::table('notification_preferences')->update(['smart'=>false]);
            return Http::response($this->policy());
        },'https://openrouter.ai/api/alpha/decisions'=>Http::response($this->response())]);
        app()->call([new ClassifyDecision($id),'handle']);
        Http::assertNotSent(fn($r)=>str_contains($r->url(),'/decisions'));
    }
    public function test_late_result_cannot_overwrite_but_price_still_trips_stop(): void
    {
        $id=$this->decision();
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy()),
            'https://openrouter.ai/api/alpha/decisions'=>function () {
                $this->travel(61)->seconds();$body=$this->response();$body['usage']['cost']=.1;
                return Http::response($body);
            }]);
        app()->call([new ClassifyDecision($id),'handle']);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'classifying','usage_micro_usd'=>100000]);
        $this->assertTrue((bool)DB::table('decision_spend_controls')->value('tripped'));
    }
    public function test_progress_kill_switch_during_policy_check_blocks_export(): void
    {
        $id=$this->decision();
        Http::fake(['https://openrouter.ai/api/v1/key'=>function () {
            config(['intelligence.progress_mode'=>'off']);return Http::response($this->policy());
        },'https://openrouter.ai/api/alpha/decisions'=>Http::response($this->response())]);
        app()->call([new ClassifyDecision($id),'handle']);
        Http::assertNotSent(fn($r)=>str_contains($r->url(),'/decisions'));
    }
    public function test_timeout_trips_durable_stop_and_later_jobs_cannot_spend(): void
    {
        $attempts=0;
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy()),
            'https://openrouter.ai/api/alpha/decisions'=>function () use (&$attempts) {
                $attempts++;throw new \Illuminate\Http\Client\ConnectionException('fixture timeout');
            }]);
        app()->call([new ClassifyDecision($this->decision()),'handle']);
        $this->assertTrue((bool)DB::table('decision_spend_controls')->value('tripped'));
        Cache::flush();$this->travel(1)->minutes();
        app()->call([new ClassifyDecision($this->decision()),'handle']);
        $this->assertSame(1,$attempts);Http::assertSentCount(1);
    }
    public function test_shadow_respects_surface_and_mode_before_reserving(): void
    {
        config(['intelligence.jev_mode'=>'shadow','intelligence.auto_work'=>false,'intelligence.auto_teammate'=>true]);
        $id=$this->decision();
        DB::table('ai_decisions')->where('id',$id)->update(['purpose'=>'shadow',
            'input'=>Crypt::encryptString(json_encode(['agent'=>false,'state'=>[]]))]);
        app()->call([new ClassifyDecision($id),'handle']);
        Http::assertNothingSent();$this->assertDatabaseCount('decision_spend_buckets',0);
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'fallback']);
    }
}
