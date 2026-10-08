<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding, Schedule};
use App\Models\AgentWork\Goal;
use App\Services\AgentSchedules\{Scheduler, Schedules};
use App\Services\AgentWork\{Goals, GoalProgress, Routines};
use App\Services\Agents\Skills;
use Illuminate\Support\Str;

final class AgentStageFourWorkBoundariesTest extends AgentWorkTestCase
{
    public function test_new_goal_steps_stop_after_assigned_skill_revision_changes(): void
    {
        $id = (string) Str::uuid();
        app(Skills::class)->save($this->user->id, ['id' => $id, 'revision' => 0, 'name' => 'Approved skill',
            'instructions' => 'Use short evidence-based notes.', 'teammateIds' => [$this->agent['id']]]);
        $g = $this->goal(); app(GoalProgress::class)->tick(); $first = $this->completeNext();
        app(Skills::class)->save($this->user->id, ['id' => $id, 'revision' => 1, 'name' => 'Changed skill',
            'instructions' => 'Different instructions.', 'teammateIds' => [$this->agent['id']]]);
        app(GoalProgress::class)->tick();
        $this->assertSame('blocked', Goal::find($g['id'])->status);
        $this->assertSame('work_skills_changed', Goal::find($g['id'])->reason);
        $this->assertDatabaseCount('agent_runs', 1);
        $saved = \App\Services\AgentWork\SkillSnapshots::forRun(Run::find($first['id']));
        $this->assertSame('Use short evidence-based notes.', $saved[0]['instructions']);
    }

    public function test_routine_reuses_scheduler_but_does_not_retarget_an_updated_local_binding(): void
    {
        $due = now()->addMinutes(2)->startOfMinute();
        $spec = ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'], 'title' => 'One reviewed routine',
            'prompt' => 'Deliver the reviewed summary.', 'timezone' => 'UTC',
            'recurrence' => ['type' => 'once', 'date' => $due->format('Y-m-d'), 'time' => $due->format('H:i')]];
        $s = app(Routines::class)->activate($this->user->id, $spec, 'routine-one');
        $same = app(Routines::class)->activate($this->user->id, $spec, 'routine-one');
        $this->assertSame($s['id'], $same['id']);
        RuntimeBinding::whereKey($this->runtime['id'])->update(['account_ref' => 'replacement']);
        $this->travelTo($due->addSecond()); app(Scheduler::class)->tick(); app(Scheduler::class)->tick();
        $this->assertDatabaseCount('agent_runs', 0);
        $this->assertDatabaseHas('agent_schedule_occurrences', ['schedule_id' => $s['id'], 'state' => 'failed', 'reason' => 'work_runtime_changed']);
    }

    public function test_routine_task_keeps_runtime_and_skills_pin_after_admission(): void
    {
        $due = now()->addMinutes(2)->startOfMinute();
        $s = app(Routines::class)->activate($this->user->id, ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
            'title' => 'Reviewed', 'prompt' => 'Summarize.', 'timezone' => 'UTC',
            'recurrence' => ['type' => 'once', 'date' => $due->format('Y-m-d'), 'time' => $due->format('H:i')]], 'routine-two');
        $this->travelTo($due->addSecond()); app(Scheduler::class)->tick();
        $this->assertDatabaseCount('agent_work_run_pins', 1);
        RuntimeBinding::whereKey($this->runtime['id'])->update(['effort' => 'high']);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
    }

    public function test_non_work_runs_retain_existing_local_model_change_semantics(): void
    {
        $this->admit('Existing ordinary task'); RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'new-model']);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertOk();
        $this->assertDatabaseCount('agent_work_run_pins', 0);
    }

    public function test_goal_scope_rejects_foreign_user_and_changed_activation_payload(): void
    {
        $g = $this->goal(1);
        try { app(Goals::class)->find($this->user->id + 100, $g['id']); $this->fail('Cross-user read accepted.'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(404, $e->getResponse()->getStatusCode()); }
        $step = $g['milestones'][0]; unset($step['status'], $step['runId'], $step['evidence']);
        try { app(Goals::class)->activate($this->user->id, [...$this->workSpec(), 'title' => 'Different', 'milestones' => [$step]], 'goal-test'); $this->fail('Changed activation replay accepted.'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame('work_activation_conflict', $e->getResponse()->getData(true)['code']); }
    }
}
