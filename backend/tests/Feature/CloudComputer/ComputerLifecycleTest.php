<?php
namespace Tests\Feature\CloudComputer;

use App\Jobs\ReconcileCloudWorkspace;
use App\Models\User;
use App\Services\CloudWorkspaces\{Lifecycle, Shutdown};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{DB, Queue};
use Illuminate\Support\Str;

class ComputerLifecycleTest extends ComputerTestCase
{
    public function test_create_is_idempotent_and_one_computer_per_account(): void
    {
        $first = $this->createComputer();
        $this->assertTrue($first['enabled']);
        $this->assertSame('stopped', $first['computer']['state']);
        $this->assertSame($this->cid, $first['computer']['workspaceId']);
        $this->assertNull($first['computer']['hostId']);
        $this->assertFalse($first['computer']['online']);
        $this->assertSame(['claude' => null, 'codex' => null], $first['computer']['login']);
        $this->assertSame([], $first['computer']['projects']);
        $this->assertSame(['allowanceSeconds', 'usedSeconds', 'resetsAt', 'overage'], array_keys($first['computer']['hours']));
        $this->postJson('/api/cloud-computer', ['id' => $this->cid])->assertOk()->assertJsonPath('computer.workspaceId', $this->cid);
        // A second creation id still resolves to the account's single computer.
        $this->postJson('/api/cloud-computer', ['id' => (string) Str::uuid()])->assertOk()->assertJsonPath('computer.workspaceId', $this->cid);
        $this->assertSame(1, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->count());
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('computer.workspaceId', $this->cid);
        // The same id cannot be claimed by another account.
        $other = User::factory()->create(['email_verified_at' => now()]);
        $this->assertSame(0, DB::table('cloud_workspaces')->where('user_id', $other->id)->count());
        $this->getJson('/api/cloud-workspaces')->assertOk()->assertJsonCount(0, 'workspaces');
    }

    public function test_get_without_a_computer_and_unauthenticated(): void
    {
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('computer', null)->assertJsonPath('enabled', true);
        $this->withToken('wrong')->getJson('/api/cloud-computer')->assertUnauthorized();
        $this->withToken('cloud-test')->postJson('/api/cloud-computer/wake', ['acceptTerms' => true])->assertStatus(404)->assertJsonPath('code', 'computer_missing');
    }

    public function test_first_wake_needs_terms_and_later_wakes_need_no_quote(): void
    {
        $this->createComputer();
        $this->wake(false)->assertStatus(422)->assertJsonPath('code', 'terms_required');
        $this->assertSame('stopped', $this->row()->state);
        $this->wake()->assertStatus(202)->assertJsonPath('computer.state', 'starting');
        $row = $this->row();
        $this->assertSame('starting', $row->state); $this->assertNotNull($row->terms_accepted_at);
        $this->assertNull($row->device_id);
        $this->assertSame(1, DB::table('cloud_reservations')->where('workspace_id', $this->cid)->count());
        Queue::assertPushed(ReconcileCloudWorkspace::class);
        // Double tap while starting is idempotent: no second hold.
        $this->wake()->assertStatus(202)->assertJsonPath('computer.state', 'starting');
        $this->assertSame(1, DB::table('cloud_reservations')->where('workspace_id', $this->cid)->count());
        app(Lifecycle::class)->reconcile($this->cid);
        $this->assertSame(['configure'], $this->provider->calls);
        $this->assertSame('machine', $this->row()->machine_id);
    }

    public function test_state_machine_wake_run_stop_and_wake_again_without_terms(): void
    {
        $token = $this->computerReady();
        $this->assertSame('ready', $this->row()->state);
        // Up but the Host has not registered yet: still presented as starting.
        $this->getJson('/api/cloud-computer')->assertJsonPath('computer.state', 'starting');
        $this->wake()->assertStatus(409)->assertJsonPath('code', 'already_running');
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinutes(2)]);
        $s = $this->getJson('/api/cloud-computer')->assertOk()->json('computer');
        $this->assertSame('idle', $s['state']); $this->assertTrue($s['online']); $this->assertSame($this->hostId, $s['hostId']);
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 2, 'waitingApproval' => 1, 'login' => ['claude' => true, 'codex' => false]])->assertOk();
        $s = $this->getJson('/api/cloud-computer')->json('computer');
        $this->assertSame('running', $s['state']); $this->assertSame(2, $s['sessionsActive']); $this->assertSame(1, $s['approvalsWaiting']);
        $this->assertSame(['claude' => true, 'codex' => false], $s['login']);
        $this->postJson('/api/cloud-computer/stop')->assertOk()->assertJsonPath('computer.state', 'stopping');
        $this->wake()->assertStatus(409)->assertJsonPath('code', 'not_stopped');
        app(Shutdown::class)->confirm($this->row());
        $s = $this->getJson('/api/cloud-computer')->json('computer');
        $this->assertSame('stopped', $s['state']); $this->assertFalse($s['online']);
        $this->assertSame(['claude' => null, 'codex' => null], $s['login']);
        $this->assertSame('0', (string) app(Wallet::class)->payload($this->user->id)['heldUnits']);
        $this->assertNull(DB::table('remote_hosts')->where('host_id', $this->hostId)->value('online_until'));
        // Later wake: no terms, no quote, no device proof.
        $this->wake(false)->assertStatus(202)->assertJsonPath('computer.state', 'starting');
        $this->assertSame(2, (int) $this->row()->generation);
        $this->assertSame(2, DB::table('cloud_computer_wakes')->count());
    }

    public function test_wake_keeps_every_existing_safety_gate(): void
    {
        $this->createComputer();
        config(['cloud_workspaces.starts_enabled' => false]);
        $this->wake()->assertStatus(503); $this->assertSame('stopped', $this->row()->state);
        config(['cloud_workspaces.starts_enabled' => true, 'cloud_workspaces.pilot_users' => ['999999']]);
        $this->wake()->assertStatus(403);
        config(['cloud_workspaces.pilot_users' => [], 'cloud_workspaces.daily_micro_limit' => 1]);
        $this->wake()->assertStatus(503);
        $this->assertSame(0, DB::table('cloud_reservations')->count());
        config(['cloud_workspaces.daily_micro_limit' => 100000000, 'cloud_workspaces.enabled' => false]);
        $this->assertFalse($this->getJson('/api/cloud-computer')->assertOk()->json('enabled'));
        $this->wake()->assertStatus(503);
        config(['cloud_workspaces.enabled' => true, 'cloud_workspaces.starts_per_account_hour' => 1]);
        $this->wake()->assertStatus(202); $this->sleepNow();
        $this->wake()->assertStatus(429);
    }

    public function test_unfunded_wake_returns_allowance_exhausted(): void
    {
        $this->createComputer();
        DB::table('vibes_grants')->where('user_id', $this->user->id)->update(['remaining' => 0]);
        $this->wake()->assertStatus(402)->assertJsonPath('code', 'allowance_exhausted');
        $this->assertSame('stopped', $this->row()->state);
        $this->assertSame(0, DB::table('cloud_reservations')->count());
    }

    public function test_included_hours_cover_the_wake_without_token_holds_and_blocked_overage_refuses(): void
    {
        config(['vibes.plans.pro_v2.cloudHours' => 10, 'cloud_workspaces.overage' => 'blocked']);
        $this->createComputer();
        $s = $this->getJson('/api/cloud-computer')->json('computer.hours');
        $this->assertSame(36000, $s['allowanceSeconds']); $this->assertSame('blocked', $s['overage']);
        $this->wake()->assertStatus(202);
        $this->assertSame('0', (string) app(Wallet::class)->payload($this->user->id)['heldUnits']);
        $this->sleepNow();
        // Used up and blocked: no wake, nothing held.
        app(\App\Services\CloudWorkspaces\Allowance::class)->consume($this->row(), 36000, 'test-window');
        $this->wake(false)->assertStatus(402)->assertJsonPath('code', 'allowance_exhausted');
        $this->assertSame('stopped', $this->row()->state);
    }

    public function test_free_account_cannot_create_or_wake(): void
    {
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete();
        $this->postJson('/api/cloud-computer', ['id' => $this->cid])->assertStatus(402);
        $this->assertSame(0, DB::table('cloud_workspaces')->count());
    }

    public function test_bootstrap_for_a_computer_is_not_an_upload_and_ready_needs_no_checkpoint(): void
    {
        $this->computerReady();
        $row = $this->row();
        $this->assertSame('ready', $row->state); $this->assertNull($row->checkpoint_at);
        $this->assertNotNull($row->lease_until); $this->assertNotNull($row->last_activity_at);
    }

    public function test_bootstrap_tells_the_vm_supervisor_to_run_computer_mode(): void
    {
        $id = $this->cid;
        $this->createComputer();
        $this->wake()->assertStatus(202);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = DB::table('cloud_workspaces')->where('id', $id)->first();
        $boot = app(\App\Services\CloudWorkspaces\Runtime::class)->bootstrap($id, \Illuminate\Support\Facades\Crypt::decryptString($w->bootstrap_secret), 'machine', $w->generation);
        $this->assertSame('computer', $boot['mode']);
    }
}
