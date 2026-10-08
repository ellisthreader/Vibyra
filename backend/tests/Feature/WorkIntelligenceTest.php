<?php
namespace Tests\Feature;
use App\Models\{User, VibyraSession};
use App\Services\Notifications\{Devices, Inbox, Preferences};
use App\Services\Progress\WorkEvents;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;
final class WorkIntelligenceTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp(); Queue::fake(); Http::preventStrayRequests();
        config(['intelligence.events' => true, 'intelligence.inbox' => true, 'intelligence.push' => true,
            'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001', 'app.key' => 'base64:'.base64_encode(str_repeat('x',32))]);
    }
    private function fixture(string $status = 'running'): array
    {
        $u = User::factory()->create();
        $p = app(Preferences::class)->get($u->id);
        $chat = (string) Str::uuid(); $turn = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $u->id, 'title' => 'Private', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('vibes_turns')->insert(['id' => $turn, 'chat_id' => $chat, 'user_id' => $u->id, 'model' => 'fixture',
            'status' => $status, 'digest' => str_repeat('a',64), 'request' => '{}', 'allocations' => '[]', 'prompt' => 'Secret',
            'reserved' => 0, 'created_at' => now(), 'updated_at' => now()]);
        return [$u,$turn];
    }
    public function test_observation_is_idempotent_and_never_updates_turn_recovery_clock(): void
    {
        [$u,$turn] = $this->fixture(); $before = DB::table('vibes_turns')->where('id',$turn)->value('updated_at');
        $this->travel(2)->minutes(); $events = app(WorkEvents::class); $events->observe($turn); $events->observe($turn);
        $this->assertDatabaseCount('work_events',1); $this->assertSame($before, DB::table('vibes_turns')->where('id',$turn)->value('updated_at'));
        $this->assertSame('working',$events->payload($u->id,$turn)['phase']);
        $this->assertNull($events->payload(User::factory()->create()->id,$turn));
    }
    public function test_budget_completion_is_an_attention_event_not_success(): void
    {
        [$u,$turn] = $this->fixture('completed');
        DB::table('vibes_turns')->where('id',$turn)->update(['finish_reason'=>'budget_limit']);
        app(WorkEvents::class)->observe($turn); $event = DB::table('work_events')->first();
        app(Inbox::class)->publish($event->id); app(Inbox::class)->publish($event->id);
        $this->assertDatabaseCount('notification_items',1);
        $item=DB::table('notification_items')->first(); $this->assertSame('attention',$item->category);
        $this->assertStringNotContainsString('Secret',json_encode($item));
    }
    public function test_new_runtime_state_suppresses_late_delivery(): void
    {
        [$u,$turn]=$this->fixture('failed'); app(WorkEvents::class)->observe($turn);
        app(Inbox::class)->publish(DB::table('work_events')->value('id')); $item=DB::table('notification_items')->first();
        $this->assertTrue(app(Inbox::class)->current($item));
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'cancelled']);
        $this->assertFalse(app(Inbox::class)->current($item));
    }
    public function test_quiet_hours_cross_midnight_and_preserve_preferences_revision(): void
    {
        [$u]=$this->fixture(); $p=app(Preferences::class); $v=$p->payload($u->id);
        $p->save($u->id,[...$v,'quietStart'=>1320,'quietEnd'=>480,'timezone'=>'Europe/London']);
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-10-25T01:30:00Z'));
        $this->assertTrue($p->quiet($p->get($u->id)));
        try {$p->save($u->id,$v);$this->fail('Stale settings accepted');}
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {$this->assertSame(409,$e->getStatusCode());}
    }
    public function test_device_rebind_requires_installation_proof_and_revoked_session_cannot_deliver(): void
    {
        [$u]=$this->fixture();$other=User::factory()->create();
        $session=VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256','test'),'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        $data=['installation'=>(string)Str::uuid(),'proof'=>str_repeat('p',64),'token'=>'ExpoPushToken[fixture]',
            'environment'=>'development','projectId'=>config('intelligence.expo_project')];
        $devices=app(Devices::class);$id=$devices->register($session,$data)['id'];
        $this->assertTrue($devices->eligible(DB::table('notification_devices')->where('id',$id)->first()));
        $second=VibyraSession::create(['user_id'=>$other->id,'token_hash'=>hash('sha256','other')]);
        try {$devices->register($second,[...$data,'proof'=>str_repeat('q',64)]);$this->fail('Wrong proof accepted');}
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {$this->assertSame(409,$e->getStatusCode());}
        $session->revoke('logout');
        $this->assertFalse($devices->eligible(DB::table('notification_devices')->where('id',$id)->first()));
    }
    public function test_receipt_acceptance_is_not_device_delivery_and_invalid_token_is_retired(): void
    {
        [$u,$turn]=$this->fixture('completed');
        $s=VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256','test'),'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        app(Devices::class)->register($s,['installation'=>(string)Str::uuid(),'proof'=>str_repeat('p',64),'token'=>'ExpoPushToken[test]',
            'environment'=>'development','projectId'=>config('intelligence.expo_project')]);
        app(WorkEvents::class)->observe($turn);app(Inbox::class)->publish(DB::table('work_events')->value('id'));
        $id=DB::table('notification_deliveries')->value('id');
        Http::fake(['exp.host/--/api/v2/push/send'=>Http::response(['data'=>['status'=>'ok','id'=>'ticket']])]);
        app()->call([new \App\Jobs\DeliverPhoneNotification($id),'handle']);
        app()->call([new \App\Jobs\DeliverPhoneNotification($id),'handle']); Http::assertSentCount(1);
        $this->assertDatabaseHas('notification_deliveries',['id'=>$id,'state'=>'ticketed']);
        Http::fake(['exp.host/--/api/v2/push/getReceipts'=>Http::response(['data'=>['ticket'=>['status'=>'error','details'=>['error'=>'DeviceNotRegistered']]]])]);
        app()->call([new \App\Jobs\CheckPhoneReceipt($id),'handle']);
        $this->assertNotNull(DB::table('notification_devices')->value('revoked_at'));
    }
    public function test_two_progress_windows_can_advise_but_never_replace_runtime_state(): void
    {
        [$u,$turn]=$this->fixture();config(['intelligence.progress_mode'=>'advisory','intelligence.jev_mode'=>'active']);
        DB::table('notification_preferences')->where('user_id',$u->id)->update(['smart'=>true,'advisories'=>true]);
        app(WorkEvents::class)->observe($turn);$p=DB::table('work_progress')->first();
        $monitor=app(\App\Services\Progress\ProgressMonitor::class);
        for($window=1;$window<=2;$window++) {
            $id=(string)Str::uuid();
            DB::table('ai_decisions')->insert(['id'=>$id,'user_id'=>$u->id,'purpose'=>'progress','state'=>'classified',
                'fingerprint'=>'window-'.$window,'deadline'=>now()->addSeconds(30),'created_at'=>now(),'updated_at'=>now(),
                'input'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['progressId'=>$p->id,'sequence'=>$p->event_id])),
                'result'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['model'=>'fixture','answers'=>['progress'=>['choice'=>'possible_loop','confidence'=>.99]]]))]);
            $monitor->apply(DB::table('ai_decisions')->where('id',$id)->first());
            $this->assertSame($window===1?0:1,DB::table('work_events')->where('phase','possible_loop')->count());
            $this->travel(1)->minutes();
        }
        $this->assertSame('working',DB::table('work_progress')->value('phase'));
        $this->assertSame('running',DB::table('vibes_turns')->where('id',$turn)->value('status'));
        $advice=DB::table('work_events')->where('phase','possible_loop')->first();app(Inbox::class)->publish($advice->id);
        $item=DB::table('notification_items')->first();$this->assertTrue(app(Inbox::class)->current($item));
        DB::table('vibes_turns')->where('id',$turn)->update(['status'=>'completed']);
        $this->assertFalse(app(Inbox::class)->current($item));
    }
}
