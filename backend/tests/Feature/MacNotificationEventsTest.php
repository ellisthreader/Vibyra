<?php
namespace Tests\Feature;

use App\Services\LiveStatus\MacEvents;
use App\Services\Notifications\Inbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\PhonePushFixture;
use Tests\TestCase;

final class MacNotificationEventsTest extends TestCase
{
    use RefreshDatabase, PhonePushFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootPhonePush();
        $this->fakeApns();
    }

    public function test_the_first_snapshot_is_only_a_baseline(): void
    {
        $this->registerApns();
        $this->mac([self::row('t:1')]);
        $this->mac([self::row('t:1')]);
        $this->assertSame(0, DB::table('notification_items')->count());
        $this->assertSame([], $this->alerts());
    }

    public function test_a_newly_waiting_terminal_is_one_names_only_needs_you_item(): void
    {
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $item = $this->item('t:12', 'mac_approval');
        $this->assertSame(['attention', 'Claude needs you', 'Fix login bug · Vibyra', 'mac:t:12', 'time-sensitive'],
            [$item->category, $item->title, $item->body, $item->thread, $item->level]);
        $this->assertSame(['source' => 'mac', 'runId' => 'mac:t:12', 'key' => 't:12', 'kind' => 'approval',
            'title' => 'Fix login bug', 'project' => 'Vibyra', 'agent' => 'claude'], json_decode($item->destination, true));
        // Still waiting on the next report: nothing new.
        $this->mac([self::row('t:12')]);
        $this->assertSame(1, DB::table('notification_items')->count());
        $this->getJson('/api/notifications/v1/inbox/'.$item->id, $this->auth)->assertOk()
            ->assertJsonPath('item.body', 'Fix login bug · Vibyra')->assertJsonPath('item.actionable', true)
            ->assertJsonPath('item.destination.source', 'mac');
    }

    public function test_finished_and_failed_come_from_working_rows_moving_into_recent(): void
    {
        $this->mac([], [self::row('t:1', 'Ship it', 'Web', 'claude'), self::row('t:2', 'Migrate', 'Api', 'codex')]);
        $this->mac([], [], [['key' => 't:1', 'title' => 'Ship it', 'outcome' => 'done'], ['key' => 't:2', 'title' => 'Migrate', 'outcome' => 'failed']]);
        $done = $this->item('t:1', 'mac_completed');
        $failed = $this->item('t:2', 'mac_failed');
        $this->assertSame(['replies', 'Claude finished', 'Ship it · Web', 'active'], [$done->category, $done->title, $done->body, $done->level]);
        $this->assertSame(['failures', 'Codex stopped with an error', 'Migrate · Api'], [$failed->category, $failed->title, $failed->body]);
        // The same recent rows on a heartbeat announce nothing again.
        $this->mac([], [], [['key' => 't:1', 'title' => 'Ship it', 'outcome' => 'done'], ['key' => 't:2', 'title' => 'Migrate', 'outcome' => 'failed']]);
        $this->assertSame(2, DB::table('notification_items')->count());
    }

    public function test_teammates_the_phone_row_and_unknown_recent_rows_never_notify(): void
    {
        $this->mac([], [self::row('t:5')]);
        $this->mac([self::row('m:agent-1'), ['key' => 'phone', 'title' => 'iPhone wants to connect', 'project' => '', 'agent' => '']],
            [], [['key' => 't:9', 'title' => 'Old pane', 'outcome' => 'done']]);
        $this->assertSame(0, DB::table('notification_items')->count());
    }

    public function test_a_flapping_key_alerts_once_per_three_minutes_and_resolves_when_answered(): void
    {
        $this->registerApns();
        $this->mac([], [self::row('t:1')]);
        $this->mac([self::row('t:1')]);
        $first = $this->item('t:1', 'mac_approval');
        // Answered on the Mac: the item leaves the badge and is no longer actionable.
        $this->mac([], [self::row('t:1')]);
        $this->assertNotNull(DB::table('notification_items')->where('id', $first->id)->value('read_at'));
        $this->assertFalse(app(Inbox::class)->current(DB::table('notification_items')->find($first->id)));
        // Waiting again a minute later: no second alert; the earlier item comes back instead.
        $this->travel(1)->minutes();
        $this->mac([self::row('t:1')]);
        $this->assertSame(1, DB::table('notification_items')->count());
        $this->assertNull(DB::table('notification_items')->where('id', $first->id)->value('read_at'));
        $this->assertCount(1, $this->alerts());
        // After the cool-down it is a new moment.
        $this->mac([], [self::row('t:1')]);
        $this->travel(4)->minutes();
        $this->mac([self::row('t:1')]);
        $this->assertSame(2, DB::table('notification_items')->count());
        $this->assertCount(2, $this->alerts());
    }

    public function test_a_burst_is_one_summary_push_with_every_item_in_the_inbox(): void
    {
        $this->registerApns();
        $this->mac([], [self::row('t:1', 'One'), self::row('t:2', 'Two'), self::row('t:3', 'Three')]);
        $this->mac([self::row('t:1', 'One'), self::row('t:2', 'Two'), self::row('t:3', 'Three')]);
        $this->assertSame(3, DB::table('notification_items')->count());
        $alerts = $this->alerts();
        $this->assertCount(1, $alerts);
        $this->assertSame(['title' => '3 agents need you', 'body' => 'One, Two, Three'], $alerts[0]['aps']['alert']);
        $this->assertSame('time-sensitive', $alerts[0]['aps']['interruption-level']);
        $this->assertSame(3, $alerts[0]['aps']['badge']);
        $this->assertSame(2, DB::table('notification_deliveries')->where('state', 'suppressed')->where('error', 'Summarized')->count());
        $this->assertSame(1, DB::table('notification_deliveries')->where('state', 'accepted')->count());
    }

    public function test_the_same_transition_recorded_twice_is_one_event(): void
    {
        $this->mac([], [self::row('t:1')]);
        $previous = DB::table('live_status_snapshots')->where('user_id', $this->userId)->first();
        $next = ['attention' => [self::row('t:1')], 'working' => [], 'recent' => []];
        app(MacEvents::class)->record($this->userId, $previous, $next, 'Mac');
        app(MacEvents::class)->record($this->userId, $previous, $next, 'Mac');
        $this->assertSame(1, DB::table('work_events')->where('source', 'mac')->count());
        $this->assertSame(1, DB::table('notification_items')->count());
    }

    public function test_off_unless_the_flag_is_on(): void
    {
        config(['intelligence.mac_events' => false]);
        $this->mac([], [self::row('t:1')]);
        $this->mac([self::row('t:1')]);
        $this->assertSame(0, DB::table('notification_items')->count());
    }
}
