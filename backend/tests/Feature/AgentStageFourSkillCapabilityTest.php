<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\Agents\Skills;
use App\Services\AgentRuns\{Leases, RunnerFlow};
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Str;

final class AgentStageFourSkillCapabilityTest extends AgentWorkTestCase
{
    private function skill(): void
    {
        app(Skills::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'revision' => 0,
            'name' => 'Reviewed skill', 'instructions' => 'Use exact saved instructions.', 'teammateIds' => [$this->agent['id']]]);
    }

    private function capability(mixed $value): RuntimeBinding
    {
        $b = RuntimeBinding::findOrFail($this->runtime['id']);
        $b->forceFill(['capabilities' => [...$b->capabilities, 'pinnedSkillsV1' => $value]])->save();
        return $b;
    }

    public function test_old_or_non_boolean_capability_cannot_silently_drop_assigned_skills(): void
    {
        $this->skill();
        foreach ([false, null, 1, 'true'] as $cap) {
            $this->capability($cap);
            $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
                'prompt' => 'Follow assigned instructions.', 'idempotencyKey' => 'legacy-skill'])
                ->assertStatus(409)->assertJsonPath('code', 'runtime_skills_unsupported');
        }
        $this->assertDatabaseCount('agent_runs', 0); $this->assertDatabaseCount('agent_run_skill_snapshots', 0);
        $this->capability(true); $this->admit();
        $this->assertSame('Use exact saved instructions.', $this->claim()['profile']['skills'][0]['instructions']);
    }

    public function test_fresh_binding_fences_already_admitted_skill_task_before_claim_and_completion(): void
    {
        $this->skill(); $this->admit(); $stale = RuntimeBinding::findOrFail($this->runtime['id']);
        $old = $this->capability(false);
        $this->assertNull(app(Leases::class)->claim($old));
        try { app(Leases::class)->claim($stale); $this->fail('A stale capability cannot claim.'); }
        catch (HttpResponseException $e) { $this->assertSame('runtime_skills_unsupported', $e->getResponse()->getData(true)['code']); }
        $fresh = $this->capability(true); $run = app(Leases::class)->claim($fresh); $this->assertNotNull($run);
        $this->capability(false);
        try { app(RunnerFlow::class)->complete($fresh, $run->id, $run->lease_generation, 'Dropped instructions'); $this->fail('Old executor must be fenced.'); }
        catch (HttpResponseException $e) { $this->assertSame('runtime_skills_unsupported', $e->getResponse()->getData(true)['code']); }
        $this->assertNull(Run::findOrFail($run->id)->answer);
        app(RunnerFlow::class)->complete($this->capability(true), $run->id, $run->lease_generation, 'Saved instructions followed.');
        $this->assertSame('completed', Run::findOrFail($run->id)->state);
    }

    public function test_empty_or_pre_stage4_snapshots_keep_old_executor_compatibility(): void
    {
        $this->capability(false); $this->admit(); $run = $this->claim();
        $this->assertSame([], $run['profile']['skills']);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $run['generation'], 'answer' => 'No skill needed.'], $this->runnerHeaders())->assertOk();
        config(['agents_v2.work_enabled' => false]); $this->admit('Legacy admitted task', 'legacy-before-stage4');
        config(['agents_v2.work_enabled' => true]); $this->skill();
        $this->assertSame([], $this->claim()['profile']['skills']);
    }
}
