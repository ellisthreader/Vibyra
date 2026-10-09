<?php
namespace Tests\Feature;

abstract class AgentJobsTestCase extends AgentWorkTestCase
{
    use \Tests\Support\AgentCoordinationFixture;
    protected function setUp(): void
    {
        parent::setUp(); $this->coordinationRuntime();
        config(['agents_v2.parallel_jobs_enabled' => true]);
    }
    protected function job(string $key, string $mode = 'independent', string $prompt = 'Summarize a test document.'): array
    {
        return $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'stage5-'.$key,
            'prompt' => $prompt, 'executionMode' => $mode])->assertCreated()->json('run');
    }
    protected function slot(int $slot): array
    {
        return $this->postJson($this->runnerPath('/claim'), ['workerSlot' => $slot], $this->runnerHeaders())->assertOk()->json('run');
    }
    protected function finish(array $run, string $answer = 'Checked result'): void
    {
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'),
            ['generation' => $run['generation'], 'answer' => $answer], $this->runnerHeaders())->assertOk();
    }
}
