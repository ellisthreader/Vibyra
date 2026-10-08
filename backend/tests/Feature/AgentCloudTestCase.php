<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\{Admission, Grants};
use App\Services\CloudWorkspaces\Runtime;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
use Tests\Feature\CloudComputer\ComputerTestCase;

abstract class AgentCloudTestCase extends ComputerTestCase
{
    protected string $cloudToken;
    protected string $agentId;
    protected function setUp(): void
    {
        parent::setUp();
        config(['agents_v2.enabled' => true, 'agents_v2.user_ids' => '*', 'agents_v2.cloud_enabled' => true]);
        $this->cloudToken = $this->computerReady();
        $this->reportAccounts();
        $this->agentId = (string) Str::uuid();
        DB::table('agent_teammates')->insert(['id' => $this->agentId, 'user_id' => $this->user->id,
            'name' => 'Cloud tester', 'avatar' => 'spark', 'brief' => '', 'memory' => '', 'integrations' => '[]', 'create_hash' => str_repeat('a', 64), 'chat_id' => (string) Str::uuid(), 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
    }
    protected function reportAccounts(): void
    {
        $this->asRuntime($this->cloudToken, 'post', 'agents/accounts', ['generation' => $this->row()->generation,
            'accounts' => [['provider' => 'claude', 'accountId' => 'cloud', 'label' => 'Test cloud account', 'authenticated' => true,
                'models' => ['sonnet'], 'efforts' => ['high']]]])->assertOk();
    }
    protected function policyBody(array $overrides = []): array
    {
        $q = $this->postJson('/api/agents/v2/cloud/quote', ['profile' => 'standard', 'deviceId' => $this->device->uuid,
            'budgetUnits' => 100000, 'deadlineSeconds' => 600])->assertOk()->json('quote');
        return array_replace(['quoteId' => $q['id'], 'deviceId' => $this->device->uuid, 'provider' => 'claude', 'accountId' => 'cloud',
            'model' => 'sonnet', 'effort' => 'high', 'maxStarts' => 2, 'totalBudgetUnits' => 200000, 'totalSeconds' => 1200,
            'expiresAt' => now()->addHours(2)->toIso8601String(), 'expectedRevision' => 0], $overrides);
    }
    protected function policy(): array
    {
        return $this->putJson('/api/agents/v2/cloud', $this->policyBody())->assertOk()->json('policy');
    }
    protected function register(array $p): array
    {
        return $this->asRuntime($this->cloudToken, 'post', 'agents/register', ['generation' => $this->row()->generation,
            'runtimeId' => $p['runtimeId'], 'provider' => 'claude', 'accountId' => 'cloud', 'model' => 'sonnet', 'effort' => 'high',
            'capabilities' => ['controlledTools' => true, 'taskSteering' => true]])->assertOk()->json();
    }
    protected function admit(array $p): Run
    {
        return app(Admission::class)->admit($this->user->id, ['agentId' => $this->agentId, 'runtimeId' => $p['runtimeId'],
            'prompt' => 'Write a checklist', 'idempotencyKey' => (string) Str::uuid()])[0];
    }
}
