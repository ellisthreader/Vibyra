<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\Memory\{Memories, Recall, Scope};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentStageTwoSteeredMemoryTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    public function test_latest_task_correction_retrieves_relevant_memory_without_reviving_forgotten_facts(): void
    {
        $this->bootV2();
        RuntimeBinding::whereKey($this->runtime['id'])->update(['capabilities' => json_encode(['controlledTools' => true, 'taskSteering' => true])]);
        $run = Run::findOrFail($this->admit('Plan lunch')['id']);
        $scope = Scope::hash($run->runtime_snapshot);
        $memory = app(Memories::class)->put($this->user->id, $this->agent['id'], $scope,
            ['fact' => 'Hermes uses weekly Tuesday reviews.']);
        $this->assertStringNotContainsString('Hermes', app(Recall::class)->text($run, ''));
        $this->postJson('/api/agents/v2/runs/'.$run->id.'/instructions', ['idempotencyKey' => (string) Str::uuid(),
            'expectedRevision' => 0, 'text' => 'Use the Hermes project instead.'])->assertOk();
        $this->assertStringContainsString('Hermes', app(Recall::class)->text($run->fresh(), ''));
        app(Memories::class)->change($this->user->id, $this->agent['id'], $scope, $memory['id'],
            ['revision' => $memory['revision'], 'action' => 'forget']);
        $this->assertStringNotContainsString('Hermes', app(Recall::class)->text($run->fresh(), ''));
    }
}
