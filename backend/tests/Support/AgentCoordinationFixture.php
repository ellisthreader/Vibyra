<?php
namespace Tests\Support;
trait AgentCoordinationFixture
{
    protected function coordinationRuntime(): void
    {
        config(['agents_v2.coordination_enabled' => true]);
        $this->runtime = $this->postJson('/api/agents/v2/runtimes', ['hostId' => $this->hostId, 'provider' => 'claude',
            'accountRef' => 'reviewed-account', 'model' => 'sonnet', 'effort' => 'medium', 'providerVersion' => 'test',
            'capabilities' => ['controlledTools' => true, 'pinnedSkillsV1' => true, 'parallelJobsV1' => true, 'workerSlots' => 3]])->assertCreated()->json('runtime');
    }
}
