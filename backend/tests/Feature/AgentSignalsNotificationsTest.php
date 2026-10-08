<?php
namespace Tests\Feature;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Events;
use App\Services\AgentWork\Signals\{Digests,DigestRead,Settings};
use App\Services\Notifications\{AgentRunNotifications,Inbox,Preferences};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture,AgentSignalsFixture};
use Tests\TestCase;
class AgentSignalsNotificationsTest extends TestCase
{
    use RefreshDatabase,AgentV2Fixture,AgentSignalsFixture;
    protected function setUp():void { parent::setUp(); $this->signalsBoot(); }
    private function finished(string $state='completed'):Run
    {
        DB::table('vibyra_sessions')->where('user_id',$this->user->id)->update(['idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        $r=Run::find($this->admit()['id']); $r->forceFill(['state'=>$state,'answer'=>'Fixture completed.','finished_at'=>now()])->save();
        app(Events::class)->append($r,'run.'.$state); return $r;
    }
    public function test_decisions_mode_preserves_inbox_but_only_allows_blockers():void
    {
        $this->mode('decisions'); $this->finished(); $this->finished('failed');
        $p=app(Preferences::class)->get($this->user->id);
        $this->assertFalse(app(Preferences::class)->allows($p,'replies','agent_completed'));
        $this->assertTrue(app(Preferences::class)->allows($p,'attention','agent_failed'));
        $this->assertDatabaseCount('notification_items',2);
        $this->assertDatabaseCount('agent_signal_digest_items',0);
    }
    public function test_daily_digest_has_exact_owned_run_links_and_shared_acknowledgement():void
    {
        $this->travelTo('2026-10-09 08:00:00'); $this->mode('daily'); $run=$this->finished();
        $this->assertDatabaseCount('agent_signal_digest_items',1); $this->assertNull(app(Digests::class)->publish($this->user->id));
        $this->travelTo('2026-10-09 09:01:00'); $id=app(Digests::class)->publish($this->user->id); $this->assertNotNull($id);
        $this->assertNull(app(Digests::class)->publish($this->user->id)); $d=app(Digests::class)->find($this->user->id,$id);
        $this->assertSame($run->id,$d['items'][0]['runId']); $this->assertSame($this->agent['id'],$d['items'][0]['agentId']);
        $item=DB::table('notification_items')->where('id',$d['notificationId'])->first();
        $this->assertSame(['source'=>'agent_digest','digestId'=>$id],json_decode($item->destination,true));
        $this->assertTrue(app(Inbox::class)->current($item));
        $this->postJson('/api/notifications/v1/inbox/'.$item->id.'/read',[])->assertOk();
        $this->assertTrue(app(Digests::class)->find($this->user->id,$id)['read']);
        $this->assertFalse(app(Inbox::class)->current(DB::table('notification_items')->where('id',$item->id)->first()));
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class); app(Digests::class)->find($this->user->id+1,$id);
    }
    public function test_quiet_hours_defer_across_midnight_and_dst_repeated_hour_does_not_duplicate():void
    {
        $this->travelTo('2026-10-09 21:00:00'); $this->mode('daily',['digestMinute'=>1380,'quietStart'=>1320,'quietEnd'=>420]);
        $this->finished(); $this->travelTo('2026-10-09 23:01:00'); $this->assertNull(app(Digests::class)->publish($this->user->id));
        $this->travelTo('2026-10-10 07:01:00'); $this->assertNotNull(app(Digests::class)->publish($this->user->id));
        $this->travelTo('2026-11-01 04:30:00'); $this->mode('daily',['timezone'=>'America/New_York','digestMinute'=>90]); $this->finished();
        $this->travelTo('2026-11-01 05:31:00'); $this->assertNotNull(app(Digests::class)->publish($this->user->id));
        $this->travelTo('2026-11-01 06:31:00'); $this->assertNull(app(Digests::class)->publish($this->user->id));
        $this->assertDatabaseCount('agent_signal_digests',2);
    }
    public function test_settled_and_expired_approvals_never_appear_in_digest():void
    {
        $this->travelTo('2026-10-09 08:59:00'); $this->mode('daily');
        $c=$this->gmailInstall('fixture@example.com'); $this->grant($c,['gmail_read','gmail_search','gmail_send']); $this->fakeGmail(['gmail-token-a'=>[]]);
        $this->admit(); $run=$this->claim();
        $action=$this->callTool($run,'gmail_send',$c,['to'=>'fixture@example.com','subject'=>'Fixture','body'=>'Test only'],'send')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id',$action['id'])->update(['state'=>'declined']);
        $this->travelTo('2026-10-09 09:01:00'); $this->assertNull(app(Digests::class)->publish($this->user->id));
        $this->assertSame([],app(DigestRead::class)->items($this->user->id,null,'2026-10-09'));
    }
    public function test_preference_cas_and_mode_changes_do_not_replay_buffered_events():void
    {
        $this->travelTo('2026-10-09 08:00:00'); $this->mode('daily'); $this->finished(); $this->mode('all');
        $this->assertNotNull(DB::table('agent_signal_digest_items')->value('discarded_at'));
        $this->mode('daily'); $this->travelTo('2026-10-09 09:01:00'); $this->assertNull(app(Digests::class)->publish($this->user->id));
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        app(Settings::class)->save($this->user->id,['expectedRevision'=>1,'mode'=>'all','timezone'=>'UTC','quietStart'=>null,'quietEnd'=>null,'digestMinute'=>540]);
    }
    public function test_daily_keeps_urgent_deliveries_immediate_and_never_buffers_them():void
    {
        $this->notificationDevice(); $this->notificationDevice(); $this->mode('daily'); $r=$this->finished('failed');
        $item=DB::table('notification_items')->where('user_id',$this->user->id)->sole();
        $this->assertSame(2,DB::table('notification_deliveries')->where('item_id',$item->id)->where('state','pending')->count());
        $this->assertDatabaseCount('agent_signal_digest_items',0);
        $event=\App\Models\AgentV2\RunEvent::where('run_id',$r->id)->where('type','run.failed')->sole();
        app(AgentRunNotifications::class)->record($event); $this->assertDatabaseCount('notification_deliveries',2);
        $this->assertTrue(app(Preferences::class)->allows(app(Preferences::class)->get($this->user->id),'attention','agent_approval'));
        $this->finished(); $completed=DB::table('notification_items')->where('category','replies')->sole();
        $this->assertSame(2,DB::table('notification_deliveries')->where('item_id',$completed->id)->where('state','suppressed')->count());
        $this->assertDatabaseCount('agent_signal_digest_items',1);
    }

    public function test_malformed_digest_account_advances_cursor_outside_rolled_back_publication():void
    {
        $this->mode('daily'); $this->finished();
        DB::table('notification_preferences')->where('user_id',$this->user->id)->update(['timezone'=>'Invalid/Timezone']);
        $this->assertSame(0,app(Digests::class)->tick());
        $this->assertNotNull(DB::table('notification_preferences')->where('user_id',$this->user->id)->value('agent_digest_checked_at'));
        $this->assertDatabaseCount('agent_signal_digests',0);
    }

    public function test_native_alert_policy_defers_quiet_hours_and_never_replays_suppressed_sources():void
    {
        $this->travelTo('2026-10-09 08:00:00');
        $this->mode('daily',['quietStart'=>420,'quietEnd'=>540]); $this->finished('failed'); $this->finished();
        $urgent=DB::table('notification_items')->whereIn('event_id',DB::table('work_events')->where('phase','agent_failed')->select('id'))->sole();
        $completed=DB::table('notification_items')->where('category','replies')->sole();
        $this->assertSame('deferred',app(Inbox::class)->payload($urgent)['alertDisposition']);
        $this->assertSame('suppressed',app(Inbox::class)->payload($completed)['alertDisposition']);
        $this->assertTrue(app(Inbox::class)->payload($completed)['actionable']);
        $this->travelTo('2026-10-09 09:01:00');
        $this->assertSame('eligible',app(Inbox::class)->payload($urgent)['alertDisposition']);
        $digest=app(Digests::class)->publish($this->user->id);
        $itemId=app(Digests::class)->find($this->user->id,$digest)['notificationId'];
        $item=DB::table('notification_items')->where('id',$itemId)->sole();
        $this->assertSame('eligible',app(Inbox::class)->payload($item)['alertDisposition']);
        $this->mode('all');
        $this->assertSame('suppressed',app(Inbox::class)->payload($completed)['alertDisposition']);
        $this->assertSame('suppressed',app(Inbox::class)->payload($item)['alertDisposition']);
    }

    public function test_all_progress_does_not_repeat_started_alert_for_each_tool_result():void
    {
        $this->mode('all'); $r=Run::find($this->admit()['id']); $r->forceFill(['state'=>'running'])->save();
        app(Events::class)->append($r,'run.state',['from'=>'starting','to'=>'running']);
        app(Events::class)->append($r,'run.state',['from'=>'waiting_for_tool','to'=>'running']);
        app(Events::class)->append($r,'run.state',['from'=>'waiting_for_approval','to'=>'running']);
        $this->assertSame(1,DB::table('work_events')->where('phase','agent_progress')->count());
    }

}
