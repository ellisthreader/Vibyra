<?php
namespace Tests\Feature;

use App\Services\AgentRuns\Cloud\Policies;

final class AgentCloudMemoryTest extends AgentCloudTestCase
{
    public function test_revoked_compute_does_not_prevent_reviewing_or_forgetting_cloud_memory(): void
    {
        $p = $this->policy();
        $base = '/api/agents/v2/teammates/'.$this->agentId.'/memories';
        $scope = $this->getJson($base.'?runtimeId='.$p['runtimeId'])->assertOk()->json('accountScope');
        $m = $this->postJson($base, ['runtimeId' => $p['runtimeId'], 'accountScope' => $scope, 'fact' => 'Use short reports.'])->assertStatus(201)->json('memory');
        app(Policies::class)->revoke($this->user->id, 1);
        $this->getJson($base.'?runtimeId='.$p['runtimeId'])->assertOk()->assertJsonPath('memories.0.fact', 'Use short reports.');
        $this->patchJson($base.'/'.$m['id'], ['runtimeId' => $p['runtimeId'], 'accountScope' => $scope, 'revision' => $m['revision'], 'action' => 'forget'])
            ->assertOk()->assertJsonPath('memory.status', 'forgotten');
        $this->assertFalse(app(Policies::class)->payload($this->user->id)['policy']['enabled']);
    }
}
