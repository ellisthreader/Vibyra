<?php
namespace Tests\Feature;

use App\Models\AgentWork\{Goal, FollowUp};
use App\Services\AgentWork\{GoalProgress, FollowUpProgress};
use Illuminate\Support\Facades\DB;

final class AgentStageFourFairnessTest extends AgentWorkTestCase
{
    public function test_old_blocked_goals_do_not_starve_new_active_work(): void
    {
        $g = $this->goal(1); $this->fillBlocked('agent_work_goals', $g['id']);
        app(GoalProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 0);
        app(GoalProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 1);
        $this->assertSame('active', Goal::find($g['id'])->status);
    }

    public function test_paused_followups_do_not_starve_due_work_or_expiry(): void
    {
        $f = $this->follow(['kind' => 'time', 'at' => now()->addMinute()->toIso8601String()]);
        $this->fillBlocked('agent_work_followups', $f['id']); $this->travel(2)->minutes();
        app(FollowUpProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 0);
        app(FollowUpProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 1);
        $this->assertSame('admitted', FollowUp::find($f['id'])->status);
    }

    private function fillBlocked(string $table, string $id): void
    {
        $template = (array) DB::table($table)->where('id', $id)->first(); $rows = [];
        // An old checked active item must still be reached after unseen blocked work rotates.
        DB::table($table)->where('id', $id)->update(['checked_at' => now()->subHour()]);
        for ($i = 1; $i <= 205; $i++) $rows[] = [...$template,
            'id' => sprintf('00000000-0000-4000-8000-%012d', $i), 'status' => 'blocked'];
        DB::table($table)->insert($rows);
    }
}
