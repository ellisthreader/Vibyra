<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/**
 * 2026-10-07: after Delete everything (retention removed the Fly app and disks), a reconnect ticking projects woke
 * nothing: the boot that failed before the delete showed as an error and held sync starts back for 30 minutes.
 */
class ConnectAfterDeleteTest extends SyncTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.connect_consent_version' => 3, 'cloud_workspaces.connect_requires_face' => false]);
        DB::table('cloud_connect_consents')->delete();
    }

    private function connect(array $projects = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/connect', ['accept' => true, 'consentVersion' => 3] + ($projects ? ['projects' => $projects] : []));
    }

    /** Connect makes the computer under its own id. */
    private function computer(): object
    {
        return DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->first();
    }

    /** The old life: a start that just timed out, and the app and disks already removed by retention. */
    private function failedAndRemoved(): void
    {
        DB::table('cloud_workspaces')->update(['state' => 'stopped', 'stop_reason' => 'boot_timeout', 'generation' => 3, 'machine_id' => null,
            'volume_id' => null, 'retention_deleted_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_connect_after_delete_everything_starts_cloud_for_its_projects(): void
    {
        $this->connect()->assertOk();
        $this->failedAndRemoved();
        $this->deleteJson('/api/cloud-computer/connect')->assertOk();
        $this->connect([['id' => 'mac-hke', 'name' => 'HKE']])->assertOk()->assertJsonPath('connected', true);
        $w = $this->computer();
        $this->assertSame(['starting', null, null, 4], [$w->state, $w->stop_reason, $w->retention_deleted_at, (int) $w->generation]);
    }

    public function test_a_connect_with_nothing_ticked_starts_nothing_but_clears_the_old_failure(): void
    {
        $this->connect()->assertOk();
        $this->failedAndRemoved();
        $this->connect()->assertOk()->assertJsonPath('computer.state', 'stopped');
        $this->assertSame(['stopped', null], [$this->computer()->state, $this->computer()->stop_reason]);
    }

    public function test_ticking_a_project_starts_cloud_even_right_after_a_failed_boot(): void
    {
        $this->connect()->assertOk();
        $this->failedAndRemoved();
        $this->putJson('/api/cloud-computer/access/projects', ['projects' => [['id' => 'mac-hke', 'name' => 'HKE', 'allowed' => true]]])->assertOk();
        $this->assertSame('starting', $this->computer()->state);
    }
}
