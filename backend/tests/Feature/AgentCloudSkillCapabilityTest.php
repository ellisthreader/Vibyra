<?php
namespace Tests\Feature;

use App\Models\AgentV2\RuntimeBinding;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AgentCloudSkillCapabilityTest extends AgentCloudTestCase
{
    public function test_policy_never_invents_executor_skill_support_and_registration_reports_it_exactly(): void
    {
        config(['agents_v2.work_enabled' => true]); $p = $this->policy();
        $this->assertFalse(RuntimeBinding::findOrFail($p['runtimeId'])->capabilities['pinnedSkillsV1']);
        $this->register($p);
        $this->assertFalse(RuntimeBinding::findOrFail($p['runtimeId'])->capabilities['pinnedSkillsV1']);
        $id = (string) Str::uuid();
        DB::table('agent_skills')->insert(['id' => $id, 'user_id' => $this->user->id, 'name' => 'Cloud skill',
            'instructions' => 'Use saved instructions.', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_skill_assignments')->insert(['skill_id' => $id, 'agent_id' => $this->agentId]);
        try { $this->admit($p); $this->fail('An old Cloud runner cannot ignore assigned skills.'); }
        catch (HttpResponseException $e) { $this->assertSame('runtime_skills_unsupported', $e->getResponse()->getData(true)['code']); }
        $this->assertDatabaseCount('agent_runs', 0);
        $this->asRuntime($this->cloudToken, 'post', 'agents/register', ['generation' => $this->row()->generation,
            'runtimeId' => $p['runtimeId'], 'provider' => 'claude', 'accountId' => 'cloud', 'model' => 'sonnet', 'effort' => 'high',
            'capabilities' => ['controlledTools' => true, 'taskSteering' => true, 'pinnedSkillsV1' => true]])->assertOk();
        $this->assertTrue(RuntimeBinding::findOrFail($p['runtimeId'])->capabilities['pinnedSkillsV1']);
        $this->admit($p); $this->assertDatabaseCount('agent_run_skill_snapshots', 1);
        $this->register($p); // An older replacement must clear, not inherit, the last executor's claim.
        $this->assertFalse(RuntimeBinding::findOrFail($p['runtimeId'])->capabilities['pinnedSkillsV1']);
    }
}
