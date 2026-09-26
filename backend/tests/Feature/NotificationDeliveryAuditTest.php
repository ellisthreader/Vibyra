<?php
namespace Tests\Feature;
use App\Jobs\{ClassifyDecision,DeliverPhoneNotification};
use App\Models\{User,VibyraSession};
use App\Services\Notifications\{Devices,Inbox,Preferences};
use App\Services\Progress\WorkEvents;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB,Http,Queue};
use Illuminate\Support\Str;
use Tests\TestCase;
final class NotificationDeliveryAuditTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();Queue::fake();Http::preventStrayRequests();
        $this->travelTo(now()->startOfSecond());
        config(['intelligence.events'=>true,'intelligence.inbox'=>true,'intelligence.push'=>true,
            'intelligence.expo_project'=>'00000000-0000-4000-8000-000000000001',
            'app.key'=>'base64:'.base64_encode(str_repeat('a',32))]);
    }
    private function cloud(): array
    {
        $u=User::factory()->create();app(Preferences::class)->get($u->id);
        $s=VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256','audit-user'),
            'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        app(Devices::class)->register($s,['installation'=>(string)Str::uuid(),'proof'=>str_repeat('p',64),
            'token'=>'ExpoPushToken[fixture]','environment'=>'development','projectId'=>config('intelligence.expo_project')]);
        $chat=(string)Str::uuid();$turn=(string)Str::uuid();
        DB::table('vibes_chats')->insert(['id'=>$chat,'user_id'=>$u->id,'title'=>'Private','created_at'=>now(),'updated_at'=>now()]);
        DB::table('vibes_turns')->insert(['id'=>$turn,'chat_id'=>$chat,'user_id'=>$u->id,'model'=>'fixture','status'=>'running',
            'digest'=>str_repeat('a',64),'request'=>'{}','allocations'=>'[]','prompt'=>'Secret','reserved'=>0,'created_at'=>now(),'updated_at'=>now()]);
        return [$u,$turn];
    }
    private function tool(string $turn, string $state, mixed $result=null): void
    {
        DB::table('vibes_tools')->insert(['id'=>(string)Str::uuid(),'turn_id'=>$turn,'provider_id'=>'test',
            'operation'=>'safe_read','arguments'=>'{}','action_state'=>$state,'result'=>$result ? json_encode($result) : null,
            'created_at'=>now()->subMinutes(14),'updated_at'=>now()]);
    }
    private function publish(string $turn): object
    {
        app(WorkEvents::class)->observe($turn);app(Inbox::class)->publish(DB::table('work_events')->latest('id')->value('id'));
        return DB::table('notification_items')->first();
    }
    public function test_push_is_private_and_cannot_outlive_cloud_approval(): void
    {
        [$u,$turn]=$this->cloud();$this->tool($turn,'pending');$item=$this->publish($turn);
        Http::fake(['exp.host/--/api/v2/push/send'=>Http::response(['data'=>['status'=>'ok','id'=>'ticket']])]);
        (new DeliverPhoneNotification(DB::table('notification_deliveries')->value('id')))->handle();
        Http::assertSent(fn($r)=>$r['ttl']===60 && $r['data']===['version'=>1,'notificationId'=>$item->id]
            && !str_contains(json_encode($r->data()),'Secret') && !str_contains(json_encode($r->data()),$turn));
    }
    public function test_host_ttl_is_remaining_freshness_not_inbox_expiry(): void
    {
        $u=User::factory()->create();app(Preferences::class)->get($u->id);
        app(WorkEvents::class)->record($u->id,'host_conversation','run',['phase'=>'approval_pending',
            'occurredAt'=>now()->subSeconds(110)->toIso8601String()]);
        app(Inbox::class)->publish(DB::table('work_events')->value('id'));
        $this->assertSame(10,app(Inbox::class)->deliveryTtl(DB::table('notification_items')->first()));
    }
    public function test_outbox_retries_stop_after_four_throttled_sends(): void
    {
        [$u,$turn]=$this->cloud();DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'completed']);$this->publish($turn);
        Http::fake(['exp.host/--/api/v2/push/send'=>Http::response([],429)]);
        $id=DB::table('notification_deliveries')->value('id');
        for($i=0;$i<6;$i++) { (new DeliverPhoneNotification($id))->handle();$this->travel(16)->minutes(); }
        Http::assertSentCount(4);$this->assertDatabaseHas('notification_deliveries',['id'=>$id,'state'=>'failed','attempts'=>4]);
    }
    public function test_foreign_account_cannot_read_or_mark_notification(): void
    {
        [$u,$turn]=$this->cloud();DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'completed']);$item=$this->publish($turn);
        $other=User::factory()->create();VibyraSession::create(['user_id'=>$other->id,'token_hash'=>hash('sha256','other-user'),
            'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        $this->withToken('other-user')->getJson('/api/notifications/v1/inbox/'.$item->id)->assertNotFound();
        $this->withToken('other-user')->postJson('/api/notifications/v1/inbox/'.$item->id.'/read')->assertOk();
        $this->assertNull(DB::table('notification_items')->value('read_at'));
    }
    public function test_unknown_tool_outcome_is_never_reported_as_completed(): void
    {
        [$u,$turn]=$this->cloud();$this->tool($turn,'unknown',['error'=>'unknown outcome']);
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'completed']);$item=$this->publish($turn);
        $this->assertSame('outcome_unknown',DB::table('work_progress')->value('phase'));
        $this->assertSame('attention',$item->category);
    }
    public function test_monitor_scan_reaches_work_beyond_first_hundred_rows(): void
    {
        [$u,$turn]=$this->cloud();config(['intelligence.progress_mode'=>'shadow','intelligence.jev_mode'=>'shadow']);
        DB::table('notification_preferences')->where('user_id',$u->id)->update(['smart'=>true]);
        for($i=0;$i<101;$i++) app(WorkEvents::class)->record($u->id,'cloud_turn','dummy-'.$i,['phase'=>'working']);
        for($i=0;$i<3;$i++) $this->tool($turn,'completed',['error'=>'failed']);
        app(WorkEvents::class)->observe($turn);
        $this->artisan('vibyra:observe-work')->assertSuccessful();
        Queue::assertPushed(ClassifyDecision::class,1);
    }
}
