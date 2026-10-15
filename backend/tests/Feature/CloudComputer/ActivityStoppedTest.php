<?php
namespace Tests\Feature\CloudComputer;

use App\Services\Notifications\Inbox;
use Illuminate\Support\Facades\DB;

/** `stopped`: the Host's silent end for a conversation that was interrupted or crashed without finished/failed. */
class ActivityStoppedTest extends ActivityTestCase
{
    private function at(int $secondsAgo): string
    {
        return now()->subSeconds($secondsAgo)->toIso8601String();
    }

    private function items(): array
    {
        return DB::table('notification_items')->where('user_id', $this->user->id)->orderBy('event_id')->get()->all();
    }

    public function test_a_stop_is_accepted_stored_and_ends_the_conversation_in_the_live_list_without_an_event(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'running', $this->at(60)), $this->ev(self::B, 'waiting', $this->at(50), 'codex')])->assertOk()->assertJsonPath('accepted', 2);
        $this->assertSame([2, 1], [count($this->feed()->json('running')), $this->feed()->json('approvals')]);
        $this->report($token, [$this->ev(self::A, 'stopped', $this->at(10)), $this->ev(self::B, 'stopped', $this->at(9), 'codex')])
            ->assertOk()->assertExactJson(['ok' => true, 'accepted' => 2, 'duplicates' => 0, 'rejected' => 0]);
        $r = $this->feed()->assertOk()->json();
        $this->assertSame([[], 0], [$r['running'], $r['approvals']]);
        $this->assertSame(['approval_needed'], array_column($r['events'], 'kind'), 'a stop is silent: no event of its own');
        $this->assertSame(2, DB::table('cloud_host_events')->where('phase', 'stopped')->count());
        // A turn that runs again after a stop is live again; an unknown phase is still refused.
        $this->report($token, [$this->ev(self::A, 'running', $this->at(2))])->assertOk();
        $this->assertSame([self::A], array_column($this->feed()->json('running'), 'id'));
        $this->report($token, [$this->ev(self::A, 'paused')])->assertOk()->assertJsonPath('rejected', 1);
    }

    public function test_a_stop_never_pushes_and_retires_the_waiting_approval(): void
    {
        $token = $this->liveComputer();
        config(['intelligence.host_events' => true, 'intelligence.events' => true, 'intelligence.inbox' => true]);
        $this->report($token, [$this->ev(self::A, 'waiting', $this->at(20))])->assertOk();
        $item = $this->items()[0];
        $this->assertTrue(app(Inbox::class)->current($item));
        $this->report($token, [$this->ev(self::A, 'stopped', $this->at(5))])->assertOk();
        $this->assertCount(1, $this->items(), 'nothing was pushed for the stop');
        $this->assertFalse(app(Inbox::class)->current($item), 'the approval is gone with the conversation');
        // Even a stop reported late (older than the push freshness window) files nothing.
        $this->report($token, [$this->ev(self::B, 'stopped', $this->at(3000))])->assertOk();
        $this->assertCount(1, $this->items());
    }

    public function test_a_stop_is_not_work_and_does_not_keep_the_computer_awake(): void
    {
        $token = $this->liveComputer();
        $before = now()->subMinutes(40);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['last_activity_at' => $before]);
        $this->report($token, [$this->ev(self::A, 'stopped', $this->at(1))])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertSame($before->format('Y-m-d H:i'), \Illuminate\Support\Carbon::parse($this->row()->last_activity_at)->format('Y-m-d H:i'));
        $this->report($token, [$this->ev(self::A, 'finished', $this->at(1))])->assertOk();
        $this->assertTrue(\Illuminate\Support\Carbon::parse($this->row()->last_activity_at)->gt(now()->subMinute()), 'a real phase still does');
    }

    public function test_running_and_waiting_expire_after_fifteen_minutes_or_when_the_host_report_is_stale(): void
    {
        $token = $this->liveComputer();
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['ready_at' => now()->subHours(2)]); // up long before these phases
        $this->report($token, [$this->ev(self::A, 'running', $this->at(14 * 60)), $this->ev(self::B, 'waiting', $this->at(16 * 60), 'codex')])->assertOk()->assertJsonPath('accepted', 2);
        $r = $this->feed()->assertOk()->json();
        $this->assertSame([[self::A], 0], [array_column($r['running'], 'id'), $r['approvals']], 'a 16 minute old waiting phase with nothing newer is not shown');
        $this->assertSame(['approval_needed'], array_column($r['events'], 'kind'), 'it is still an event to catch up on');
        // A newer phase for the same conversation is what keeps it listed.
        $this->report($token, [$this->ev(self::B, 'running', $this->at(30), 'codex')])->assertOk();
        $this->assertEqualsCanonicalizing([self::A, self::B], array_column($this->feed()->json('running'), 'id'));
        // The Host's own report is outside the 60 s window: nothing is running, whatever the phases say.
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['host_activity_at' => now()->subSeconds(90)]);
        $this->assertSame([[], 0], [$this->feed()->json('running'), $this->feed()->json('approvals')]);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['host_activity_at' => now()->subSeconds(30)]);
        $this->assertCount(2, $this->feed()->json('running'));
    }
}
