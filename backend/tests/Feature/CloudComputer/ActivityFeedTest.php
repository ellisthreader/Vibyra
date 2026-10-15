<?php
namespace Tests\Feature\CloudComputer;

use App\Models\User;
use App\Services\CloudComputer\Activity\{ActivityRetention, HostEvents};
use Illuminate\Support\Facades\DB;

/** GET /api/cloud-computer/activity: events since a time, the live list and the approvals count. */
class ActivityFeedTest extends ActivityTestCase
{
    private function at(int $secondsAgo): string
    {
        return now()->subSeconds($secondsAgo)->toIso8601String();
    }

    public function test_events_running_and_approvals_come_from_the_latest_phase_of_each_conversation(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [
            $this->ev(self::A, 'running', $this->at(50)), $this->ev(self::B, 'running', $this->at(45), 'codex', 'my-app', 'Port the parser'),
            $this->ev(self::B, 'waiting', $this->at(30), 'codex', 'my-app', 'Port the parser'), $this->ev(self::A, 'finished', $this->at(20)),
        ])->assertOk()->assertJsonPath('accepted', 4);
        $r = $this->feed()->assertOk()->json();
        $this->assertSame(1, $r['approvals']);
        $this->assertSame([['provider' => 'codex', 'id' => self::B, 'project' => 'my-app', 'title' => 'Port the parser', 'phase' => 'waiting',
            'cardId' => HostEvents::cardId($this->user->id, 'codex', self::B)]], $r['running']);
        $this->assertSame([['approval_needed', self::B], ['turn_finished', self::A]], array_map(fn ($e) => [$e['kind'], $e['id']], $r['events']));
        $this->assertSame(['provider', 'id', 'project', 'phase', 'kind', 'title', 'at'], array_keys($r['events'][0]));
        $this->assertArrayHasKey('updatedAt', $r);
        // The approval is answered and the turn runs on: nothing waits, the conversation is running again.
        $this->report($token, [$this->ev(self::B, 'running', $this->at(5), 'codex')])->assertOk();
        $r = $this->feed()->assertOk()->json();
        $this->assertSame([0, ['running']], [$r['approvals'], array_column($r['running'], 'phase')]);
        $this->report($token, [$this->ev(self::B, 'failed', $this->at(1), 'codex')])->assertOk();
        $this->assertSame([0, []], [$this->feed()->json('approvals'), $this->feed()->json('running')]);
        $this->assertSame('failed', $this->feed()->json('events.2.kind'));
    }

    public function test_since_filters_and_a_returned_at_never_repeats_an_event(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'finished', $this->at(600)), $this->ev(self::B, 'finished', $this->at(60))])->assertOk();
        $this->assertCount(1, $this->feed('?since='.rawurlencode($this->at(300)))->assertOk()->json('events'));
        $this->assertCount(2, $this->feed()->json('events'));
        $last = $this->feed()->json('events.1.at');
        $this->assertCount(0, $this->feed('?since='.rawurlencode($last))->json('events'));
        $this->feed('?since=yesterday-ish')->assertStatus(422);
    }

    public function test_nothing_is_running_when_the_computer_is_asleep_silent_or_the_event_is_from_an_earlier_boot(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'running', $this->at(5)), $this->ev(self::B, 'waiting', $this->at(4))])->assertOk();
        $this->assertSame(2, count($this->feed()->json('running')));
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['host_activity_at' => now()->subMinutes(6)]);
        $this->assertSame([[], 0], [$this->feed()->json('running'), $this->feed()->json('approvals')]);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['host_activity_at' => now(), 'ready_at' => now()->addMinute()]);
        $this->assertSame([], $this->feed()->json('running'), 'a conversation cut off by a sleep never reported `finished`');
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['ready_at' => now()->subHour(), 'state' => 'stopped']);
        $this->assertSame([], $this->feed()->json('running'));
        $this->assertSame([], array_filter($this->feed()->json('events'), fn ($e) => $e['phase'] === 'running'), 'a running change only moves the live list');
    }

    public function test_the_feed_is_the_signed_in_accounts_own(): void
    {
        $token = $this->liveComputer();
        $other = User::factory()->create(['email_verified_at' => now()]);
        DB::table('cloud_host_events')->insert(['user_id' => $other->id, 'provider' => 'claude', 'agent_session_id' => self::B, 'project' => 'theirs',
            'phase' => 'waiting', 'at' => HostEvents::stamp(now()), 'created_at' => now()]);
        $this->report($token, [$this->ev(self::A, 'finished')])->assertOk();
        $r = $this->feed()->assertOk()->json();
        $this->assertSame([self::A], array_column($r['events'], 'id'));
        $this->assertSame([[], 0], [$r['running'], $r['approvals']]);
        $this->withToken('nobody')->getJson('/api/cloud-computer/activity')->assertStatus(401);
    }

    public function test_the_sync_side_can_file_a_returned_event(): void
    {
        $this->putJson('/api/cloud-computer/access/projects', ['projects' => [['id' => 'mac:my-app', 'name' => 'my-app', 'allowed' => true]]])->assertOk();
        $this->assertTrue(app(HostEvents::class)->returned($this->user->id, 'claude', self::A, 'my-app', 'Back on your PC'));
        $this->assertFalse(app(HostEvents::class)->returned($this->user->id, 'nope', self::A, 'my-app'));
        $e = $this->feed()->assertOk()->json('events.0');
        $this->assertSame(['returned', 'returned', 'Back on your PC'], [$e['kind'], $e['phase'], $e['title']]);
    }

    public function test_events_keep_seven_days_and_the_prune_is_scheduled(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'finished', $this->at(60))])->assertOk();
        $row = ['user_id' => $this->user->id, 'provider' => 'claude', 'agent_session_id' => self::B, 'project' => 'my-app', 'phase' => 'finished', 'created_at' => now()];
        DB::table('cloud_host_events')->insert([$row + ['at' => HostEvents::stamp(now()->subDays(6)->subHours(23))], $row + ['phase' => 'failed', 'at' => HostEvents::stamp(now()->subDays(8))]]);
        $this->assertSame(1, app(ActivityRetention::class)->sweep());
        $this->artisan('vibyra:cloud-activity-prune')->assertSuccessful();
        $this->assertSame(2, DB::table('cloud_host_events')->count());
        $this->travel(2)->days();
        $this->artisan('vibyra:cloud-activity-prune')->assertSuccessful();
        $this->assertSame(1, DB::table('cloud_host_events')->count(), 'the one from two days ago stays');
        $this->travel(6)->days();
        $this->artisan('vibyra:cloud-activity-prune')->assertSuccessful();
        $this->assertSame(0, DB::table('cloud_host_events')->count());
        $scheduled = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->contains(fn ($e) => str_contains($e->command, 'vibyra:cloud-activity-prune'));
        $this->assertTrue($scheduled);
    }
}
