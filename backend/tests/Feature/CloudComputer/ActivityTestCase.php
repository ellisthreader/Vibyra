<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Fixtures for the Cloud Host phase events and the activity feed (docs/cloud-switching-contract.md section 2). */
abstract class ActivityTestCase extends ComputerTestCase
{
    protected const A = '11111111-aaaa-4aaa-8aaa-111111111111';
    protected const B = '22222222-bbbb-4bbb-8bbb-222222222222';

    protected function ev(string $id, string $phase, ?string $at = null, string $provider = 'claude', string $project = 'my-app', ?string $title = 'Fix the login bug'): array
    {
        return ['provider' => $provider, 'id' => $id, 'project' => $project, 'phase' => $phase, 'title' => $title, 'at' => $at ?? now()->toIso8601String()];
    }

    /** The Host's report, by the contract path with only its bearer. */
    protected function report(string $token, array $events)
    {
        $response = $this->withToken($token)->postJson('/api/cloud-computer/host-events', ['events' => $events]);
        $this->withToken('cloud-test');
        return $response;
    }

    /** A computer that is up, with a fresh Host report, and a lease long enough for the test's clock jumps. */
    protected function liveComputer(int $running = 1): string
    {
        $token = $this->computerReady();
        $this->putJson('/api/cloud-computer/access/projects', ['projects' => array_map(fn ($name) =>
            ['id' => 'activity:'.$name, 'name' => $name, 'allowed' => true], ['my-app', 'other-app'])])->assertOk();
        $this->hold();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['last_seen_at' => now()]);
        // A little after ready, so events a few seconds old belong to this boot.
        $this->travel(120)->seconds(); $this->hold();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => $running, 'waitingApproval' => 0])->assertOk();
        return $token;
    }

    protected function hold(): void
    {
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->addHours(2), 'deadline_at' => now()->addHours(8)]);
    }

    protected function feed(string $query = '')
    {
        return $this->getJson('/api/cloud-computer/activity'.$query);
    }

    protected function row(): object
    {
        return DB::table('cloud_workspaces')->where('id', $this->cid)->first();
    }
}
