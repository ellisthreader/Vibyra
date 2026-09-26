<?php
namespace Tests\Feature;
use App\Logging\RedactSecrets;
use App\Models\User;
use App\Services\Decisions\{ProviderKeyPolicy,SpendGuard,JevClient};
use App\Services\Notifications\Preferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache,DB,Http,Log};
use Illuminate\Support\Str;
use Monolog\Handler\TestHandler;
use Tests\TestCase;
final class JevProtectionTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp(); Cache::flush(); Http::preventStrayRequests();
        config(['intelligence.auto_work'=>true,'intelligence.jev_key'=>'dedicated-fixture','services.openrouter.key'=>'other-fixture']);
    }
    private function decision(?int $user=null): string
    {
        $user ??= User::factory()->create()->id;
        app(Preferences::class)->get($user);
        DB::table('notification_preferences')->where('user_id',$user)->update(['smart'=>true]);
        $id=(string)Str::uuid();
        DB::table('ai_decisions')->insert(['id'=>$id,'user_id'=>$user,'purpose'=>'routing','fingerprint'=>hash('sha256',$id),
            'input'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['quote'=>['selection'=>'auto','request'=>[]],'state'=>[]])),
            'deadline'=>now()->addMinute(),'created_at'=>now(),'updated_at'=>now()]);
        return $id;
    }
    private function policy(array $change=[]): array
    {
        return ['data'=>array_replace(['limit'=>5,'limit_remaining'=>5,'limit_reset'=>null,'include_byok_in_limit'=>true,
            'is_management_key'=>false,'is_provisioning_key'=>false],$change)];
    }
    public function test_duplicate_jobs_and_other_users_cannot_bypass_global_concurrency(): void
    {
        $a=$this->decision();$b=$this->decision();$g=app(SpendGuard::class);
        $this->assertTrue($g->claim($a));$this->assertFalse($g->claim($a));$this->assertFalse($g->claim($b));
        $g->release($a);$this->assertTrue($g->claim($b));
        $this->assertSame(2,DB::table('decision_spend_buckets')->where('id','lifetime')->value('calls'));
    }
    public function test_lifetime_budget_survives_cache_clear_audit_deletion_and_a_new_day(): void
    {
        config(['intelligence.total_micro_usd'=>1000]);$g=app(SpendGuard::class);$a=$this->decision();
        $this->assertTrue($g->claim($a));$g->release($a);Cache::flush();DB::table('ai_decisions')->delete();
        $this->travel(2)->days();$this->assertFalse($g->claim($this->decision()));
    }
    public function test_user_limit_applies_across_all_purposes_and_global_limit_across_accounts(): void
    {
        config(['intelligence.user_minute_calls'=>1,'intelligence.minute_calls'=>2]);
        $u=User::factory()->create()->id;$g=app(SpendGuard::class);$a=$this->decision($u);
        $this->assertTrue($g->claim($a));$g->release($a);
        $b=$this->decision($u);DB::table('ai_decisions')->where('id',$b)->update(['purpose'=>'progress']);
        $this->assertFalse($g->claim($b));$c=$this->decision();$this->assertTrue($g->claim($c));$g->release($c);
        $this->assertFalse($g->claim($this->decision()));
    }
    public function test_worker_death_keeps_reservation_and_stops_further_spend(): void
    {
        $g=app(SpendGuard::class);$a=$this->decision();$this->assertTrue($g->claim($a));
        $this->travel(11)->seconds();$b=$this->decision();$this->assertFalse($g->claim($b));
        $this->assertTrue((bool)DB::table('decision_spend_controls')->value('tripped'));
        $g->release($a);Cache::flush();$this->assertFalse($g->claim($this->decision()));
        $this->assertSame(1000,DB::table('decision_spend_buckets')->where('id','lifetime')->value('reserved_micro_usd'));
    }
    public function test_late_old_release_cannot_unlock_current_worker_and_high_cost_trips_stop(): void
    {
        $g=app(SpendGuard::class);$a=$this->decision();$this->assertTrue($g->claim($a));$g->release($a);
        $b=$this->decision();$this->assertTrue($g->claim($b));
        $g->release($a,2000);$this->assertSame($b,DB::table('decision_spend_controls')->value('owner'));
        $g->release($b);Cache::flush();$this->assertFalse($g->claim($this->decision()));
    }
    public function test_key_policy_rejects_unlimited_resetting_oversized_or_management_keys(): void
    {
        foreach([['limit'=>null],['limit_reset'=>'daily'],['limit'=>100],['is_management_key'=>true],
            ['include_byok_in_limit'=>false],['limit_remaining'=>0]] as $change) {
            Cache::flush();Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy($change))]);
            try {app(ProviderKeyPolicy::class)->assertSafe();$this->fail('Unsafe key accepted');}
            catch(\RuntimeException $e){$this->assertSame('provider_budget_not_verified',$e->getMessage());}
        }
    }
    public function test_safe_key_is_checked_without_inference_and_cached_only_for_same_key(): void
    {
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy())]);
        app(ProviderKeyPolicy::class)->assertSafe();app(ProviderKeyPolicy::class)->assertSafe();Http::assertSentCount(1);
        config(['intelligence.jev_key'=>'replacement-fixture']);app(ProviderKeyPolicy::class)->assertSafe();Http::assertSentCount(2);
    }
    public function test_shared_key_and_changed_endpoint_are_rejected_without_network(): void
    {
        config(['intelligence.jev_key'=>'other-fixture']);
        try{app(ProviderKeyPolicy::class)->assertSafe();$this->fail('Shared key accepted');}catch(\RuntimeException){}
        config(['intelligence.jev_url'=>'https://untrusted.test/collect']);
        try{app(JevClient::class)->decide([],[]);$this->fail('Changed destination accepted');}catch(\RuntimeException){}
        Http::assertNothingSent();
    }
    public function test_logs_redact_credentials_nested_headers_and_exception_messages(): void
    {
        $secret='sk-or-v1-'.str_repeat('z',48);config(['intelligence.jev_key'=>$secret]);
        $handler=new TestHandler();$logger=Log::channel('single');$logger->getLogger()->setHandlers([$handler]);
        $logger->error('Provider '.$secret,['headers'=>['Authorization'=>'Bearer private-session'],
            'api_key'=>'different-secret','exception'=>new \RuntimeException('Failure '.$secret)]);
        $record=$handler->getRecords()[0];$encoded=json_encode([$record->message,$record->context]);
        foreach([$secret,'private-session','different-secret'] as $value)$this->assertStringNotContainsString($value,$encoded);
        $this->assertStringContainsString('[REDACTED]',$encoded);
    }
    public function test_unverified_key_blocks_paid_requests_even_when_a_job_is_replayed(): void
    {
        config(['intelligence.jev_mode'=>'active','intelligence.progress_mode'=>'advisory']);
        Http::fake(['https://openrouter.ai/api/v1/key'=>Http::response($this->policy(['limit'=>null]))]);
        $id=$this->decision();DB::table('ai_decisions')->where('id',$id)->update(['purpose'=>'progress']);
        $job=new \App\Jobs\ClassifyDecision($id);
        app()->call([$job,'handle']);app()->call([$job,'handle']);
        Http::assertSentCount(1);
        Http::assertNotSent(fn($r)=>str_contains($r->url(),'/decisions'));
        $this->assertDatabaseHas('ai_decisions',['id'=>$id,'state'=>'fallback']);
        $this->assertSame(1,DB::table('decision_spend_buckets')->where('id','lifetime')->value('calls'));
    }
    public function test_secret_setup_refuses_noninteractive_input(): void
    {
        $this->artisan('vibyra:configure-jev --no-interaction')->assertExitCode(1);
    }
}
