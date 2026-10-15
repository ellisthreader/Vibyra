<?php
namespace Tests\Feature\CloudComputer;

use App\Services\Notifications\Inbox;
use Illuminate\Support\Facades\DB;

/** Attention phases feed the existing inbox, behind the existing flags, off by default. */
class ActivityFanoutTest extends ActivityTestCase
{
    private function items(): array
    {
        return DB::table('notification_items')->where('user_id', $this->user->id)->orderBy('event_id')->get()->all();
    }

    private function flags(bool $on = true): void
    {
        config(['intelligence.host_events' => $on, 'intelligence.events' => $on, 'intelligence.inbox' => $on]);
    }

    public function test_everything_stays_off_by_default(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'waiting'), $this->ev(self::A, 'finished'), $this->ev(self::B, 'failed')])->assertOk()->assertJsonPath('accepted', 3);
        $this->assertSame([], $this->items());
        $this->assertSame(0, DB::table('work_events')->count());
        \Illuminate\Support\Facades\Queue::assertNotPushed(\App\Jobs\DeliverPhoneNotification::class);
        \Illuminate\Support\Facades\Queue::assertNotPushed(\App\Jobs\SendLiveActivityUpdate::class);
    }

    public function test_both_progress_flags_are_needed_and_a_stale_replay_is_silent(): void
    {
        $token = $this->liveComputer();
        config(['intelligence.host_events' => true, 'intelligence.events' => false, 'intelligence.inbox' => true]);
        $this->report($token, [$this->ev(self::A, 'waiting')])->assertOk();
        $this->assertSame([], $this->items());
        config(['intelligence.events' => true]);
        $this->report($token, [$this->ev(self::B, 'finished', now()->subMinutes(30)->toIso8601String())])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertSame([], $this->items(), 'an event older than ten minutes never pushes');
    }

    public function test_waiting_finished_and_failed_use_fixed_lock_screen_text_and_name_the_conversation_inside(): void
    {
        $token = $this->liveComputer();
        $this->flags();
        $this->report($token, [$this->ev(self::A, 'running'), $this->ev(self::A, 'waiting'), $this->ev(self::B, 'finished', null, 'codex', 'other-app', 'SECRET title')])->assertOk();
        $this->report($token, [$this->ev('33333333-cccc-4ccc-8ccc-333333333333', 'failed', null, 'gemini')])->assertOk();
        $items = $this->items();
        $this->assertSame(['Your cloud computer needs approval', 'Your cloud computer finished', 'A task on your cloud computer failed'], array_column($items, 'title'));
        $this->assertSame(['attention', 'replies', 'attention'], array_column($items, 'category'));
        $d = json_decode($items[0]->destination, true);
        $this->assertSame(['cloud_computer', 'approval.needed', ['provider' => 'claude', 'id' => self::A], 'my-app', $this->cid], [$d['source'], $d['event'], $d['agentSession'], $d['project'], $d['workspaceId']]);
        $this->assertSame('Fix the login bug', $d['detail']['title']);
        $this->assertSame('Finished in other-app.', json_decode($items[1]->destination, true)['detail']['body']);
        $this->assertSame('cloud_task_failed', DB::table('work_events')->where('id', $items[2]->event_id)->value('phase'));
    }

    public function test_each_conversation_is_throttled_on_its_own_and_the_failed_switch_applies(): void
    {
        $token = $this->liveComputer();
        $this->flags();
        $this->report($token, [$this->ev(self::A, 'waiting'), $this->ev(self::B, 'waiting')])->assertOk();
        $this->report($token, [$this->ev(self::A, 'waiting', now()->addSecond()->toIso8601String())])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertCount(2, $this->items(), 'A again within the throttle is silent; B was never held back by A');
        app(\App\Services\Notifications\Preferences::class)->get($this->user->id);
        DB::table('notification_preferences')->where('user_id', $this->user->id)->update(['failures' => false]);
        $this->report($token, [$this->ev(self::B, 'failed')])->assertOk();
        $this->assertCount(2, $this->items());
    }

    public function test_an_approval_stops_being_current_once_the_conversation_moves_on(): void
    {
        $token = $this->liveComputer();
        $this->flags();
        $this->report($token, [$this->ev(self::A, 'waiting', now()->subSeconds(10)->toIso8601String())])->assertOk();
        $item = $this->items()[0];
        $this->assertTrue(app(Inbox::class)->current($item));
        $this->report($token, [$this->ev(self::A, 'running', now()->subSeconds(2)->toIso8601String())])->assertOk();
        $this->assertFalse(app(Inbox::class)->current($item));
    }
}
