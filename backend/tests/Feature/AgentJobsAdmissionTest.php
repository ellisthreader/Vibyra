<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AgentJobsAdmissionTest extends AgentJobsTestCase
{
    public function test_three_concurrent_jobs_and_queue_capacity_are_visible_and_legacy_claim_cannot_take_them(): void
    {
        foreach (range(1, 4) as $n) $this->job('job-'.$n);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $a = $this->slot(0); $b = $this->slot(1); $c = $this->slot(2);
        $this->assertCount(3, array_unique([$a['id'], $b['id'], $c['id']]));
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertNoContent();
        $this->getJson('/api/agents/v2/jobs')->assertOk()->assertJsonPath('capacity.running', 3)->assertJsonPath('capacity.queued', 1);
        $this->finish($b); $d = $this->slot(1); $this->assertNotContains($d['id'], [$a['id'], $b['id'], $c['id']]);
        foreach (range(5, 28) as $n) $this->job('job-'.$n);
        $body = ['agentId' => $this->agent['id'], 'idempotencyKey' => 'full-draft', 'prompt' => 'Retain this draft', 'executionMode' => 'independent'];
        $this->postJson('/api/agents/v2/runs', $body)->assertStatus(429)->assertJsonPath('code', 'job_queue_full');
        $this->getJson('/api/agents/v2/jobs?agentId='.$this->agent['id'].'&idempotencyKey=full-draft')->assertOk()->assertJsonPath('runs', []);
        $this->getJson('/api/agents/v2/jobs?agentId='.$this->agent['id'].'&idempotencyKey=stage5-job-1')->assertOk()->assertJsonPath('runs.0.id', $a['id']);
        $this->getJson('/api/agents/v2/jobs?idempotencyKey=stage5-job-1')->assertStatus(422);
        $this->getJson('/api/agents/v2/jobs?agentId='.Str::uuid().'&idempotencyKey=stage5-job-1')->assertOk()->assertJsonPath('runs', []);
    }
    public function test_default_ordered_jobs_stay_serial_and_execution_mode_is_part_of_replay_identity(): void
    {
        $a = $this->job('ordered-a', 'ordered'); $b = $this->job('ordered-b', 'ordered');
        $claimed = $this->slot(0); $this->assertSame($a['id'], $claimed['id']);
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 1], $this->runnerHeaders())->assertNoContent();
        $this->finish($claimed); $this->assertSame($b['id'], $this->slot(1)['id']);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'stage5-ordered-a',
            'prompt' => 'Summarize a test document.', 'executionMode' => 'independent'])->assertStatus(409)->assertJsonPath('code', 'idempotency_conflict');
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'internal-mode',
            'prompt' => 'Bypass group review', 'executionMode' => 'coordinated'])->assertStatus(422);
    }
    public function test_old_or_unsupported_runtime_does_not_silently_downgrade_independent_work(): void
    {
        RuntimeBinding::whereKey($this->runtime['id'])->update(['capabilities' => ['controlledTools' => true]]);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'old-runtime',
            'prompt' => 'Draft', 'executionMode' => 'independent'])->assertStatus(409)->assertJsonPath('code', 'runtime_upgrade');
        $this->assertDatabaseCount('agent_runs', 0);
    }
    public function test_reusing_slot_fences_old_ordered_attempt_and_cannot_resurrect_its_lease(): void
    {
        $this->job('old', 'ordered'); $old = $this->slot(0);
        $new = $this->job('new');
        DB::table('agent_runs')->where('id', $old['id'])->update(['state' => 'paused_for_limits', 'wait_revision' => $this->runtime['revision'], 'lease_expires_at' => now()->subSecond(), 'resume_after' => now()->addHour()]);
        $this->assertSame($new['id'], $this->slot(0)['id']);
        foreach (['heartbeat', 'complete', 'events'] as $path) {
            $this->postJson($this->runnerPath('/runs/'.$old['id'].'/'.$path), ['generation' => $old['generation'],
                'answer' => 'Late', 'events' => [['type' => 'message.delta', 'text' => 'Late']]], $this->runnerHeaders())
                ->assertStatus(409)->assertJsonPath('code', 'stale_job_slot');
        }
        $this->assertTrue(Run::find($old['id'])->lease_expires_at->isPast());
    }
}
