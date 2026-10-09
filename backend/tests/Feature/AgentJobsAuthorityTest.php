<?php
namespace Tests\Feature;

use App\Models\AgentV2\RuntimeBinding;
use App\Services\AgentRuns\Leases;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AgentJobsAuthorityTest extends AgentJobsTestCase
{
    public function test_account_capacity_is_shared_across_two_computers(): void
    {
        foreach (range(1, 3) as $n) $this->job('computer-a-'.$n);
        $this->slot(0); $this->slot(1); $this->slot(2);
        $first = $this->runtime;
        $this->hostId = str_repeat('c', 64); $this->coordinationRuntime();
        $body = ['agentId' => $this->agent['id'], 'idempotencyKey' => 'computer-b-task', 'prompt' => 'Different computer task',
            'runtimeId' => $this->runtime['id'], 'executionMode' => 'independent'];
        $this->postJson('/api/agents/v2/runs', $body)->assertCreated();
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertNoContent();
        $this->getJson('/api/agents/v2/jobs')->assertOk()->assertJsonPath('capacity.running', 3)->assertJsonPath('capacity.queued', 1);
        $runId = DB::table('agent_runs')->where('runtime_binding_id', $first['id'])->value('id');
        $this->postJson('/api/agents/v2/runs/'.$runId.'/cancel')->assertOk();
        $this->assertSame($this->runtime['id'], $this->slot(0)['runtime']['bindingId']);
    }
    public function test_inflight_authenticated_claim_is_fenced_when_registration_key_rotates(): void
    {
        $this->job('registration-race');
        $old = RuntimeBinding::find($this->runtime['id']);
        $this->coordinationRuntime();
        try {
            app(Leases::class)->claim($old, workerSlot: 0);
            $this->fail('Old authenticated binding claimed after rotation.');
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            $this->assertSame(409, $e->getResponse()->getStatusCode());
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->assertSame(0, DB::table('agent_runtime_slots')->count());
        $this->assertSame(0, DB::table('agent_runs')->value('lease_generation'));
    }
}
