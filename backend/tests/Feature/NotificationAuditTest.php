<?php
namespace Tests\Feature;
use App\Models\{User,VibyraSession};
use App\Services\Notifications\{Inbox,Preferences};
use App\Services\Progress\{WorkEvents,ProgressMonitor};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt,DB,Http,Queue};
use Illuminate\Support\Str;
use Tests\TestCase;
final class NotificationAuditTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp(); Queue::fake(); Http::preventStrayRequests();
        config(['intelligence.events'=>true,'intelligence.inbox'=>true,'intelligence.host_events'=>true,
            'intelligence.progress_mode'=>'advisory','intelligence.jev_mode'=>'active',
            'app.key'=>'base64:'.base64_encode(str_repeat('a',32))]);
    }
    private function cloud(): array
    {
        $u=User::factory()->create(); app(Preferences::class)->get($u->id);
        DB::table('notification_preferences')->where('user_id',$u->id)->update(['smart'=>true]);
        $chat=(string)Str::uuid();$turn=(string)Str::uuid();
        DB::table('vibes_chats')->insert(['id'=>$chat,'user_id'=>$u->id,'title'=>'Private','created_at'=>now(),'updated_at'=>now()]);
        DB::table('vibes_turns')->insert(['id'=>$turn,'chat_id'=>$chat,'user_id'=>$u->id,'model'=>'fixture','status'=>'running',
            'digest'=>str_repeat('a',64),'request'=>'{}','allocations'=>'[]','prompt'=>'Secret','reserved'=>0,'created_at'=>now(),'updated_at'=>now()]);
        app(WorkEvents::class)->observe($turn);
        return [$u,$turn,DB::table('work_progress')->first()];
    }
    private function judgment(object $u, object $p, string $window): object
    {
        $id=(string)Str::uuid();
        DB::table('ai_decisions')->insert(['id'=>$id,'user_id'=>$u->id,'purpose'=>'progress','state'=>'classified',
            'fingerprint'=>$window,'deadline'=>now()->addSeconds(30),'created_at'=>now(),'updated_at'=>now(),
            'input'=>Crypt::encryptString(json_encode(['progressId'=>$p->id,'sequence'=>$p->event_id])),
            'result'=>Crypt::encryptString(json_encode(['model'=>'fixture','answers'=>['progress'=>['choice'=>'possible_loop','confidence'=>.99]]]))]);
        return DB::table('ai_decisions')->where('id',$id)->first();
    }
    public function test_global_jev_off_blocks_previously_classified_advice(): void
    {
        [$u,$turn,$p]=$this->cloud();$decision=$this->judgment($u,$p,'kill-switch');
        config(['intelligence.jev_mode'=>'off']);
        app(ProgressMonitor::class)->apply($decision);
        $this->assertNull(DB::table('work_progress')->value('assessment'));
    }
    public function test_global_jev_off_hides_existing_advice_and_suppresses_alert(): void
    {
        [$u,$turn,$p]=$this->cloud();$monitor=app(ProgressMonitor::class);
        $monitor->apply($this->judgment($u,$p,'first-window'));
        $monitor->apply($this->judgment($u,$p,'second-window'));
        $event=DB::table('work_events')->where('phase','possible_loop')->first();
        $this->assertNotNull($event);
        app(Inbox::class)->publish($event->id);$item=DB::table('notification_items')->first();
        $this->assertTrue(app(Inbox::class)->current($item));
        config(['intelligence.jev_mode'=>'off']);
        $this->assertNull(app(WorkEvents::class)->payload($u->id,$turn)['assessment']);
        $this->assertFalse(app(Inbox::class)->current($item));
    }
    public function test_reentering_an_observed_phase_updates_runtime_projection(): void
    {
        [$u,$turn]=$this->cloud();
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'waiting']);
        app(WorkEvents::class)->observe($turn);
        $this->assertSame('tool_waiting',app(WorkEvents::class)->payload($u->id,$turn)['phase']);
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'running']);
        app(WorkEvents::class)->observe($turn);
        $this->assertSame('working',app(WorkEvents::class)->payload($u->id,$turn)['phase']);
    }
    public function test_stale_first_monitor_window_does_not_count_as_confirmation(): void
    {
        [$u,$turn,$p]=$this->cloud();$monitor=app(ProgressMonitor::class);
        $monitor->apply($this->judgment($u,$p,'first-window'));
        $this->travel(11)->minutes();
        $monitor->apply($this->judgment($u,$p,'later-window'));
        $this->assertSame(0,DB::table('work_events')->where('phase','possible_loop')->count());
    }
    public function test_expired_monitor_result_does_not_create_current_assessment(): void
    {
        [$u,$turn,$p]=$this->cloud();$decision=$this->judgment($u,$p,'expired-window');
        $this->travel(11)->minutes();app(ProgressMonitor::class)->apply($decision);
        $this->assertNull(DB::table('work_progress')->value('assessment'));
    }
    public function test_source_state_change_without_projection_cannot_apply_stale_advice(): void
    {
        [$u,$turn,$p]=$this->cloud();$decision=$this->judgment($u,$p,'state-changed');
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'completed']);
        app(ProgressMonitor::class)->apply($decision);
        $this->assertNull(app(WorkEvents::class)->payload($u->id,$turn)['assessment']);
    }
    public function test_normal_judgment_and_revoked_consent_hide_advice(): void
    {
        [$u,$turn,$p]=$this->cloud();app(ProgressMonitor::class)->apply($this->judgment($u,$p,'first'));
        $this->assertNotNull(app(WorkEvents::class)->payload($u->id,$turn)['assessment']);
        DB::table('notification_preferences')->where('user_id',$u->id)->update(['smart'=>false]);
        $this->assertNull(app(WorkEvents::class)->payload($u->id,$turn)['assessment']);
    }
    public function test_retired_host_generation_cannot_become_current_again(): void
    {
        $u=User::factory()->create();$host=str_repeat('a',64);app(Preferences::class)->get($u->id);
        VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256','audit-host'),'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        DB::table('remote_hosts')->insert(['user_id'=>$u->id,'host_id'=>$host,'name'=>'Computer','registered_at'=>now()]);
        $token=$this->withToken('audit-host')->postJson('/api/notifications/v1/host-credential',['hostId'=>$host])->assertOk()->json('token');
        $event=['sessionId'=>'session','generation'=>'old','turnId'=>'turn','sequence'=>1,'occurredAt'=>now()->toIso8601String(),'phase'=>'approval_pending'];
        $post=fn($e)=>$this->withToken($token)->postJson('/api/notifications/v1/host-events',['events'=>[$e]])->assertOk();
        $post($event);$this->travel(1)->seconds();
        $post([...$event,'generation'=>'new','phase'=>'working','occurredAt'=>now()->toIso8601String()]);
        $this->travel(1)->seconds();$post([...$event,'sequence'=>2]);
        $late=DB::table('work_events')->where('phase','approval_pending')->orderByDesc('id')->first();
        app(Inbox::class)->publish($late->id);
        $this->assertFalse(app(Inbox::class)->current(DB::table('notification_items')->first()));
    }
}
