<?php
namespace Tests\Feature;

use App\Services\AgentRuns\Cloud\WakePending;
use Illuminate\Support\Facades\DB;

final class AgentCloudWakeTest extends AgentCloudTestCase
{
    public function test_offline_task_wakes_once_inside_existing_metered_limits(): void
    {
        $p = $this->policy(); $r = $this->admit($p); $this->sleepNow();
        $before = DB::table('cloud_computer_wakes')->count();
        app(WakePending::class)->run($r->id); app(WakePending::class)->run($r->id);
        $this->assertSame('starting', $this->row()->state);
        $this->assertSame($before + 1, DB::table('cloud_computer_wakes')->count());
        $policy = DB::table('agent_cloud_policies')->first();
        $this->assertSame(1, $policy->used_starts);
        $this->assertSame(100000, $policy->reserved_budget_units);
        $this->assertSame(600, $policy->reserved_seconds);
        $this->assertGreaterThan(0, DB::table('cloud_reservations')->where('workspace_id', $this->cid)->whereNull('settled_at')->count());
    }
    public function test_exhausted_policy_pauses_without_start_or_compute_reservation(): void
    {
        $p = $this->policy(); $r = $this->admit($p); $this->sleepNow();
        DB::table('agent_cloud_policies')->update(['used_starts' => 2]);
        $before = DB::table('cloud_computer_wakes')->count();
        app(WakePending::class)->run($r->id);
        $this->assertSame('stopped', $this->row()->state);
        $this->assertSame($before, DB::table('cloud_computer_wakes')->count());
        $this->assertSame('paused_by_limits', $r->fresh()->state);
    }
    public function test_cancelled_or_pinned_other_account_never_causes_billed_wake(): void
    {
        $p = $this->policy(); $r = $this->admit($p); $this->sleepNow();
        DB::table('agent_runtime_bindings')->where('id', $p['runtimeId'])->update(['account_ref' => 'changed']);
        app(WakePending::class)->run($r->id);
        $this->assertSame('stopped', $this->row()->state);
        DB::table('agent_runtime_bindings')->where('id', $p['runtimeId'])->update(['account_ref' => 'cloud']);
        DB::table('agent_runs')->where('id', $r->id)->update(['cancel_requested_at' => now(), 'state' => 'cancelled']);
        app(WakePending::class)->run($r->id);
        $this->assertSame('stopped', $this->row()->state);
    }
    public function test_price_change_and_revocation_do_not_boot_or_consume_policy(): void
    {
        $p = $this->policy(); $r = $this->admit($p); $this->sleepNow();
        config(['cloud_workspaces.tariff_version' => 'new-price']);
        app(WakePending::class)->run($r->id);
        $this->assertSame('paused_by_limits', $r->fresh()->state);
        $this->assertSame('stopped', $this->row()->state);
        $this->assertSame(0, DB::table('agent_cloud_policies')->value('used_starts'));
    }
}
