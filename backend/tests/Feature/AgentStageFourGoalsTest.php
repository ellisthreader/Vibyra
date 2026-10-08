<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Models\AgentWork\Goal;
use App\Services\AgentWork\{Goals, GoalProgress, Specs};
use Illuminate\Support\Facades\{DB, Http};

final class AgentStageFourGoalsTest extends AgentWorkTestCase
{
    public function test_sequential_delivery_uses_real_evidence_and_requires_final_owner_confirmation(): void
    {
        $g = $this->goal(); $scanner = app(GoalProgress::class);
        $this->assertDatabaseCount('agent_runs', 0);
        $scanner->tick(); $scanner->tick(); $this->assertDatabaseCount('agent_runs', 1);
        $r = $this->completeNext('First verified result'); $scanner->tick();
        $this->assertDatabaseCount('agent_runs', 2);
        $second = Run::where('id', '!=', $r['id'])->sole();
        $this->assertStringStartsWith('Perform reviewed step 2', $second->prompt);
        $this->assertStringContainsString('<<<PRIOR_GOAL_EVIDENCE', $second->prompt);
        $this->assertStringContainsString('First verified result', $second->prompt);
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/confirm', ['revision' => Goal::find($g['id'])->revision])->assertStatus(409);
        $this->completeNext('Second verified result'); $scanner->tick();
        $fresh = $this->getJson('/api/agents/v2/goals/'.$g['id'])->assertOk()->assertJsonPath('goal.status', 'awaiting_review')
            ->assertJsonPath('goal.progress.delivered', 2)->assertJsonPath('goal.milestones.0.evidence.runId', $r['id'])->json('goal');
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/confirm', ['revision' => $g['revision']])->assertStatus(409)->assertJsonPath('code', 'work_changed');
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/confirm', ['revision' => $fresh['revision']])->assertOk()->assertJsonPath('goal.status', 'completed');
        $scanner->tick(); $this->assertDatabaseCount('agent_runs', 2); Http::assertNothingSent();
    }

    public function test_terminal_failure_blocks_remaining_required_work_and_cannot_be_marked_complete(): void
    {
        $g = $this->goal(); app(GoalProgress::class)->tick(); $r = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$r['id'].'/fail'), ['generation' => $r['generation'], 'code' => 'provider_error', 'reason' => 'Test provider failed.'], $this->runnerHeaders())->assertOk();
        app(GoalProgress::class)->tick();
        $fresh = Goal::findOrFail($g['id']); $this->assertSame('blocked', $fresh->status);
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/confirm', ['revision' => $fresh->revision])->assertStatus(409);
        app(GoalProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 1);
    }

    public function test_pause_cancel_and_expiry_prevent_future_admission(): void
    {
        $g = $this->goal();
        $p = $this->postJson('/api/agents/v2/goals/'.$g['id'].'/control', ['revision' => 1, 'action' => 'pause'])->assertOk()->json('goal');
        app(GoalProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 0);
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/control', ['revision' => $p['revision'], 'action' => 'resume'])->assertOk();
        app(GoalProgress::class)->tick();
        $fresh = Goal::findOrFail($g['id']);
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/control', ['revision' => $fresh->revision, 'action' => 'cancel'])->assertOk();
        $this->assertSame('cancelled', Run::sole()->state); app(GoalProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 1);
    }

    public function test_changed_selected_model_fences_existing_task_and_future_step_without_fallback(): void
    {
        $g = $this->goal(); app(GoalProgress::class)->tick(); $run = $this->claim();
        RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'other-model']);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'work_runtime_changed');
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->assertDatabaseCount('agent_runs', 1);
        $this->travel(3)->days(); app(GoalProgress::class)->tick();
        $this->assertSame('expired', Goal::find($g['id'])->status); $this->assertSame('cancelled', Run::sole()->state);
    }

    public function test_final_confirmation_rechecks_persisted_evidence_instead_of_cached_delivery(): void
    {
        $g = $this->goal(1); app(GoalProgress::class)->tick(); $this->completeNext(); app(GoalProgress::class)->tick();
        $row = Goal::find($g['id']); Run::query()->update(['answer' => '']);
        $this->postJson('/api/agents/v2/goals/'.$g['id'].'/confirm', ['revision' => $row->revision])->assertStatus(409);
        $this->assertNotSame('completed', $row->fresh()->status);
    }

    public function test_dates_dependencies_ownership_and_disabled_activation_fail_closed(): void
    {
        $g = $this->goal(1);
        $this->getJson('/api/agents/v2/goals/'.$g['id'], $this->runnerHeaders())->assertStatus(403);
        config(['agents_v2.work_enabled' => false]);
        $spec = [...$this->workSpec(), 'milestones' => [['key' => 'one', 'title' => 'One', 'prompt' => 'Work', 'successCriteria' => 'Evidence']]];
        try { app(Goals::class)->activate($this->user->id, $spec, 'other'); $this->fail('Disabled activation accepted.'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(503, $e->getResponse()->getStatusCode()); }
        foreach (['2026-02-30T12:00:00Z', 'tomorrowZ', '2026-12-01T25:00:00Z'] as $bad) {
            try { Specs::goal([...$spec, 'expiresAt' => $bad]); $this->fail('Invalid date accepted.'); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        }
    }
}
