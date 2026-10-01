<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{Lifecycle, Shutdown};
use Illuminate\Support\Facades\DB;

/** A booted computer whose Host never reaches the relay stops with an error, not "starting" until idle. */
class HostUnreachableTest extends ComputerTestCase
{
    private function hold(): void
    {
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->addHour(), 'deadline_at' => now()->addHours(8)]);
    }

    public function test_a_host_that_never_comes_online_stops_with_an_error(): void
    {
        $token = $this->computerReady(); $this->hold();
        $this->registerHost($token)->assertOk();
        $lifecycle = app(Lifecycle::class);
        $this->travel(149)->seconds(); $this->hold();
        $this->assertNull($lifecycle->stopReason($this->row()));
        $this->getJson('/api/cloud-computer')->assertJsonPath('computer.state', 'starting');
        $this->travel(2)->seconds(); $this->hold();
        $this->assertSame('host_unreachable', $lifecycle->stopReason($this->row()));
        app(Shutdown::class)->request($this->user->id, $this->cid, 'host_unreachable');
        app(Shutdown::class)->confirm($this->row());
        $s = $this->getJson('/api/cloud-computer')->assertOk()->json('computer');
        $this->assertSame('error', $s['state']);
        $this->assertStringContainsString('could not connect to Vibyra Cloud', $s['error']);
        // Waking again is allowed from the error state.
        $this->wake(false)->assertStatus(202)->assertJsonPath('computer.state', 'starting');
    }

    public function test_a_host_without_a_registration_also_counts_as_unreachable(): void
    {
        $this->computerReady(); $this->hold();
        $this->travel(151)->seconds(); $this->hold();
        $this->assertSame('host_unreachable', app(Lifecycle::class)->stopReason($this->row()));
    }

    public function test_a_host_seen_on_the_relay_this_boot_idles_normally(): void
    {
        $token = $this->computerReady(); $this->hold();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['last_seen_at' => now(), 'online_until' => now()->addMinutes(2)]);
        $lifecycle = app(Lifecycle::class);
        $this->travel(151)->seconds(); $this->hold();
        $this->assertNull($lifecycle->stopReason($this->row()));
        $this->travel(150)->seconds(); $this->hold();
        $this->assertSame('idle', $lifecycle->stopReason($this->row()));
    }

    public function test_a_sighting_from_an_earlier_boot_does_not_count(): void
    {
        $token = $this->computerReady(); $this->hold();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['last_seen_at' => now()->subHour()]);
        $this->travel(151)->seconds(); $this->hold();
        $this->assertSame('host_unreachable', app(Lifecycle::class)->stopReason($this->row()));
    }
}
