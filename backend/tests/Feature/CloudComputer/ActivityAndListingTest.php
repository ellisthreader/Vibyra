<?php
namespace Tests\Feature\CloudComputer;

use App\Models\RemoteHost;
use App\Services\CloudWorkspaces\Lifecycle;
use Illuminate\Support\Facades\DB;

class ActivityAndListingTest extends ComputerTestCase
{
    private function hold(): void
    {
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->addHour(), 'deadline_at' => now()->addHours(8)]);
    }

    public function test_reported_work_keeps_the_machine_up_until_the_deadline_and_idle_stops_otherwise(): void
    {
        $token = $this->computerReady(); $this->hold();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['last_seen_at' => now()]);
        $lifecycle = app(Lifecycle::class);
        $this->assertNull($lifecycle->stopReason($this->row()));
        $this->travel(301)->seconds(); $this->hold();
        $this->assertSame('idle', $lifecycle->stopReason($this->row()));
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 1, 'waitingApproval' => 0, 'login' => ['claude' => true, 'codex' => true]])->assertOk();
        $this->assertNull($lifecycle->stopReason($this->row()));
        // Waiting on an approval counts too.
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 1])->assertOk();
        $this->travel(59)->seconds(); $this->hold();
        $this->assertNull($lifecycle->stopReason($this->row()));
        // Reports older than 60 s no longer count; last_activity_at (set by the report) then decides.
        $this->travel(2)->seconds(); $this->hold();
        $this->assertNull($lifecycle->stopReason($this->row()));
        $this->travel(301)->seconds(); $this->hold();
        $this->assertSame('idle', $lifecycle->stopReason($this->row()));
        // Running work cannot outlive the user's deadline.
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 3, 'waitingApproval' => 0])->assertOk();
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['deadline_at' => now()->subSecond()]);
        $this->assertSame('deadline', $lifecycle->stopReason($this->row()));
    }

    public function test_heartbeat_requests_idle_stop_and_losing_every_session_or_the_plan_stops_it(): void
    {
        $token = $this->computerReady(); $this->hold();
        $lifecycle = app(Lifecycle::class);
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 1, 'waitingApproval' => 0])->assertOk();
        $this->assertNull($lifecycle->stopReason($this->row()));
        DB::table('vibyra_sessions')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
        $this->assertSame('authority_revoked', $lifecycle->stopReason($this->row()));
        DB::table('vibyra_sessions')->where('user_id', $this->user->id)->update(['revoked_at' => null]);
        $this->assertNull($lifecycle->stopReason($this->row()));
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['disputed' => true]);
        $this->assertSame('entitlement_or_payment', $lifecycle->stopReason($this->row()));
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['disputed' => false]);
        $runtime = app(\App\Services\CloudWorkspaces\Runtime::class);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['deadline_at' => now()->subSecond()]);
        $result = $runtime->heartbeat($runtime->authenticate($this->cid, $token), true);
        $this->assertTrue($result['stop']); $this->assertSame('stopping', $this->row()->state); $this->assertSame('deadline', $this->row()->stop_reason);
        $this->travel(46)->seconds();
        $lifecycle->reconcile($this->cid);
        $this->assertSame('stopped', $this->row()->state);
        $this->assertContains('stop', $this->provider->calls);
        $this->assertSame('0', (string) app(\App\Services\Vibes\Wallet::class)->payload($this->user->id)['heldUnits']);
    }

    public function test_activity_validates_and_stores_projects_and_login(): void
    {
        $token = $this->computerReady();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => -1, 'waitingApproval' => 0])->assertStatus(422);
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'login' => ['claude' => false, 'codex' => null],
            'projects' => [['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'], ['name' => '../evil'], ['name' => 'tool']]])->assertOk();
        $row = $this->row();
        $this->assertFalse((bool) $row->login_claude); $this->assertNull($row->login_codex);
        $this->assertSame(['app', 'tool'], array_column(json_decode($row->host_projects, true), 'name'));
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        $s = $this->getJson('/api/cloud-computer')->json('computer');
        // Cloud sync adds source/syncedAt/syncState to every project (host-only ones are source 'cloud').
        $cloud = ['source' => 'cloud', 'syncedAt' => null, 'syncState' => null, 'allowed' => false];
        $this->assertSame([['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'] + $cloud, ['name' => 'tool', 'repo' => null, 'branch' => null] + $cloud], $s['projects']);
        $this->assertSame(['claude' => false, 'codex' => null], $s['login']);
    }

    public function test_listing_gains_cloud_fields_and_connect_on_a_sleeping_computer_says_host_asleep(): void
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        $rows = collect($this->getJson('/api/remote/hosts')->assertOk()->json('computers'))->keyBy('id');
        $this->assertSame('cloud', $rows[$this->hostId]['kind']);
        $this->assertSame($this->cid, $rows[$this->hostId]['workspaceId']);
        $this->assertSame('idle', $rows[$this->hostId]['cloudState']);
        $this->assertArrayNotHasKey('kind', $rows[str_repeat('a', 64)]);
        // Up but no relay presence yet: starting, not asleep.
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => null]);
        $this->postJson('/api/remote/hosts/'.$this->hostId.'/connect', ['clientName' => 'iPhone'])->assertStatus(409)
            ->assertJsonPath('code', 'host_starting')->assertJsonPath('wake', false);
        $this->sleepNow();
        $rows = collect($this->getJson('/api/remote/hosts')->json('computers'))->keyBy('id');
        $this->assertSame('stopped', $rows[$this->hostId]['cloudState']); $this->assertFalse($rows[$this->hostId]['online']);
        $this->postJson('/api/remote/hosts/'.$this->hostId.'/connect', ['clientName' => 'iPhone'])->assertStatus(409)
            ->assertJsonPath('code', 'host_asleep')->assertJsonPath('wake', true)->assertJsonPath('ok', false);
        // A sleeping Mac keeps the generic text.
        $this->postJson('/api/remote/hosts/'.str_repeat('a', 64).'/connect', ['clientName' => 'iPhone'])->assertStatus(409)->assertJsonMissingPath('wake');
    }

    public function test_project_queue_is_validated_idempotent_and_drained_by_the_vm(): void
    {
        $this->createComputer();
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'])->assertOk()->assertJsonPath('project.repo', 'me/app');
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'])->assertOk();
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/other'])->assertStatus(409);
        $this->postJson('/api/cloud-computer/projects', ['name' => 'empty'])->assertOk()->assertJsonPath('project.repo', null);
        foreach ([['name' => '../x'], ['name' => '.hidden'], ['name' => 'a/b'], ['name' => 'ok', 'repo' => 'not a repo'], ['name' => 'ok', 'repo' => '../x/y'], ['name' => 'ok', 'repo' => 'a/b', 'branch' => '-rf']] as $bad) {
            $this->postJson('/api/cloud-computer/projects', $bad)->assertStatus(422);
        }
        $this->assertSame(2, DB::table('cloud_computer_projects')->count());
        $this->getJson('/api/cloud-computer')->assertJsonCount(2, 'computer.projects');
        $token = $this->computerReady();
        $pending = $this->asRuntime($token, 'get', 'projects/pending')->assertOk()->json('projects');
        $this->assertSame(['app', 'empty'], array_column($pending, 'name'));
        $this->asRuntime($token, 'post', 'projects/'.$pending[0]['id'].'/done', ['ok' => true])->assertOk();
        $this->asRuntime($token, 'post', 'projects/'.$pending[1]['id'].'/done', ['ok' => false, 'error' => 'clone failed'])->assertOk();
        $this->asRuntime($token, 'get', 'projects/pending')->assertOk()->assertJsonCount(0, 'projects');
        $this->assertSame(['app'], array_column($this->getJson('/api/cloud-computer')->json('computer.projects'), 'name'));
        $this->asRuntime($token, 'post', 'projects/'.(string) \Illuminate\Support\Str::uuid().'/done')->assertNotFound();
    }

    public function test_activity_counts_above_fifty_are_refused_so_project_code_cannot_hold_the_machine(): void
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 51, 'waitingApproval' => 0])->assertStatus(422);
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 9999999])->assertStatus(422);
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 50, 'waitingApproval' => 50])->assertOk();
        $this->assertSame(50, (int) $this->row()->host_running);
    }

    public function test_a_failed_clone_can_be_queued_again_under_the_same_name_but_a_done_one_stays_done(): void
    {
        $token = $this->computerReady();
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'])->assertOk();
        $id = $this->asRuntime($token, 'get', 'projects/pending')->json('projects.0.id');
        $this->asRuntime($token, 'post', 'projects/'.$id.'/done', ['ok' => false, 'error' => 'network'])->assertOk();
        $this->assertSame('failed', DB::table('cloud_computer_projects')->value('state'));
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/other'])->assertStatus(409);
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'])->assertOk();
        $this->assertSame(1, DB::table('cloud_computer_projects')->count());
        $this->assertSame('pending', DB::table('cloud_computer_projects')->value('state'));
        $this->assertNull(DB::table('cloud_computer_projects')->value('error'));
        $this->asRuntime($token, 'get', 'projects/pending')->assertJsonCount(1, 'projects');
        $this->asRuntime($token, 'post', 'projects/'.$id.'/done', ['ok' => true])->assertOk();
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app', 'branch' => 'main'])->assertOk();
        $this->assertSame('done', DB::table('cloud_computer_projects')->value('state'));
    }
}
