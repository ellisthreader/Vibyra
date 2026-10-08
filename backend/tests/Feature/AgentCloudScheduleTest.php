<?php
namespace Tests\Feature;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Cloud\WakePending;
use App\Services\AgentSchedules\Scheduler;
use Illuminate\Support\Facades\DB;

final class AgentCloudScheduleTest extends AgentCloudTestCase
{
    public function test_due_schedule_wakes_explicit_cloud_binding_once_without_local_runtime(): void
    {
        $p = $this->policy();
        $due = now()->addMinutes(2)->startOfMinute();
        $this->postJson('/api/agents/v2/schedules', ['agentId' => $this->agentId, 'runtimeId' => $p['runtimeId'],
            'prompt' => 'Prepare a checklist', 'timezone' => 'UTC', 'recurrence' => ['type' => 'once',
                'date' => $due->format('Y-m-d'), 'time' => $due->format('H:i')]])->assertCreated()->assertJsonPath('schedule.executionTarget', 'cloud')
            ->assertJsonPath('schedule.accountLabel', 'Claude Cloud account');
        $this->sleepNow(); $this->travelTo($due->addSeconds(5));
        $this->assertSame(1, app(Scheduler::class)->tick()['admitted']);
        $this->assertSame(0, app(Scheduler::class)->tick()['admitted']);
        $r = Run::sole();
        $this->assertSame($p['runtimeId'], $r->runtime_binding_id);
        $this->assertSame('cloud', $r->runtime_snapshot['executionTarget']);
        $this->assertSame('waiting_for_computer', $r->state);
        $before = DB::table('cloud_computer_wakes')->count();
        app(WakePending::class)->tick(); app(WakePending::class)->tick();
        $this->assertSame($before + 1, DB::table('cloud_computer_wakes')->count());
        $this->assertSame('starting', $this->row()->state);
        $this->assertSame(1, DB::table('agent_schedule_occurrences')->count());
    }

    public function test_expired_authority_pauses_existing_task_without_booting(): void
    {
        $p = $this->policy(); $r = $this->admit($p); $this->sleepNow();
        $this->travel(3)->hours();
        app(WakePending::class)->tick();
        $this->assertSame('paused_by_limits', $r->fresh()->state);
        $this->assertSame('stopped', $this->row()->state);
        $this->assertSame(0, DB::table('agent_cloud_policies')->value('used_starts'));
    }
}
