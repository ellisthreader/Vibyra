<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\Activity\HostEvents;
use Illuminate\Support\Facades\DB;

/** POST /api/cloud-computer/host-events: runtime bearer, idempotent, metadata only, bounded. */
class HostEventsTest extends ActivityTestCase
{
    public function test_phases_are_stored_under_the_workspace_owner_and_a_replay_changes_nothing(): void
    {
        $token = $this->liveComputer();
        $events = [$this->ev(self::A, 'running', now()->subSeconds(30)->toIso8601String()), $this->ev(self::A, 'finished', null, 'claude', 'my-app', "  Done\nwith it ")];
        $this->report($token, $events)->assertOk()->assertExactJson(['ok' => true, 'accepted' => 2, 'duplicates' => 0, 'rejected' => 0]);
        $this->report($token, $events)->assertOk()->assertExactJson(['ok' => true, 'accepted' => 0, 'duplicates' => 2, 'rejected' => 0]);
        $rows = DB::table('cloud_host_events')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame([$this->user->id, $this->cid, 'claude', self::A, 'my-app'], [$rows[0]->user_id, $rows[0]->workspace_id, $rows[0]->provider, $rows[0]->agent_session_id, $rows[0]->project]);
        $this->assertSame(['running', 'finished', 'Done with it'], [$rows[0]->phase, $rows[1]->phase, $rows[1]->title]);
        $this->assertSame(HostEvents::cardId($this->user->id, 'claude', self::A), $rows[0]->card_id);
    }

    public function test_the_workspace_may_be_named_by_path_header_or_body_and_a_wrong_bearer_is_refused(): void
    {
        $token = $this->liveComputer();
        $this->asRuntime($token, 'post', 'host-events', ['events' => [$this->ev(self::A, 'running')]])->assertOk()->assertJsonPath('accepted', 1);
        $this->withToken($token)->withHeader('X-Vibyra-Workspace', $this->cid)->postJson('/api/cloud-computer/host-events', ['events' => [$this->ev(self::A, 'waiting')]])->assertOk()->assertJsonPath('accepted', 1);
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['workspaceId' => $this->cid, 'events' => [$this->ev(self::A, 'failed')]])->assertOk()->assertJsonPath('accepted', 1);
        $this->withToken('not-the-runtime-bearer')->postJson('/api/cloud-computer/host-events', ['events' => [$this->ev(self::B, 'running')]])->assertStatus(401);
        $this->withToken('cloud-test')->postJson('/api/cloud-computer/host-events', ['events' => [$this->ev(self::B, 'running')]])->assertStatus(401);
        $this->withToken('')->postJson('/api/cloud-computer/host-events', ['events' => [$this->ev(self::B, 'running')]])->assertStatus(401);
        $this->withToken($token)->postJson('/api/cloud-runtime/'.\Illuminate\Support\Str::uuid().'/host-events', ['events' => [$this->ev(self::B, 'running')]])->assertStatus(401);
        $this->assertSame(3, DB::table('cloud_host_events')->count());
    }

    public function test_a_legacy_project_workspace_cannot_report_phases(): void
    {
        $id = $this->imported();
        [, $token] = $this->ready($id);
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => [$this->ev(self::A, 'running')]])->assertStatus(401);
        $this->withToken($token)->postJson('/api/cloud-runtime/'.$id.'/host-events', ['events' => [$this->ev(self::A, 'running')]])->assertStatus(403);
        $this->assertSame(0, DB::table('cloud_host_events')->count());
    }

    public function test_one_bad_event_does_not_poison_the_batch_and_nothing_unknown_is_stored(): void
    {
        $token = $this->liveComputer();
        $good = $this->ev(self::A, 'waiting');
        $bad = [$this->ev(self::A, 'paused'), $this->ev(self::A, 'running', null, 'openai'), $this->ev('../../etc', 'running'), $this->ev(self::A, 'running', null, 'claude', '../x'),
            $this->ev(self::A, 'running', now()->addHour()->toIso8601String()), $this->ev(self::A, 'running', now()->subDays(8)->toIso8601String()),
            $this->ev(self::A, 'running', 'not a date'), 'text', ['provider' => 'claude']];
        $good['message'] = 'SECRET prompt text'; $good['content'] = ['role' => 'user', 'text' => 'SECRET reply'];
        $this->report($token, [$good, ...$bad])->assertOk()->assertJsonPath('accepted', 1)->assertJsonPath('rejected', count($bad));
        $stored = json_encode(DB::table('cloud_host_events')->get());
        $this->assertStringNotContainsString('SECRET', $stored);
        $this->assertSame(1, DB::table('cloud_host_events')->count());
    }

    public function test_size_and_shape_are_bounded(): void
    {
        $token = $this->liveComputer();
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', [])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => []])->assertStatus(422);
        $many = array_fill(0, HostEvents::MAX_BATCH + 1, $this->ev(self::A, 'running'));
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => $many])->assertStatus(422);
        $big = array_fill(0, 40, $this->ev(self::A, 'running', null, 'claude', 'my-app', str_repeat('t', 2000)));
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => $big])->assertStatus(413)->assertJsonPath('code', 'payload_too_large');
        $this->assertSame(0, DB::table('cloud_host_events')->count());
        $long = $this->ev(self::A, 'running', null, 'claude', 'my-app', str_repeat('é', 5000));
        $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => [$long]])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertSame(200, mb_strlen((string) DB::table('cloud_host_events')->value('title')));
    }

    public function test_a_phase_change_is_the_last_real_work_and_a_replay_cannot_extend_the_stay(): void
    {
        $token = $this->liveComputer(0);
        $this->travel(1000)->seconds(); $this->hold();
        $before = $this->row()->last_activity_at;
        $this->report($token, [$this->ev(self::A, 'running', now()->subHour()->toIso8601String())])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertSame($before, $this->row()->last_activity_at, 'an old replay is history, not activity');
        $this->report($token, [$this->ev(self::A, 'finished')])->assertOk()->assertJsonPath('accepted', 1);
        $this->assertGreaterThan(strtotime($before) + 900, strtotime($this->row()->last_activity_at));
        $this->travel((int) config('cloud_workspaces.idle_seconds') - 5)->seconds(); $this->hold();
        $this->assertNull(app(\App\Services\CloudWorkspaces\Lifecycle::class)->stopReason($this->row()));
    }
}
