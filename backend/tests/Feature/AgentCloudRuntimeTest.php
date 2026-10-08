<?php
namespace Tests\Feature;

use Illuminate\Support\Facades\DB;

final class AgentCloudRuntimeTest extends AgentCloudTestCase
{
    public function test_cloud_runner_executes_v2_protocol_without_a_person_session(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey']; $r = $this->admit($p);
        $this->flushHeaders();
        $base = '/api/agents/v2/runner/'.$p['runtimeId'];
        $h = ['X-Vibyra-Runner-Key' => $key];
        $c = $this->postJson($base.'/claim', [], $h)->assertOk()->json('run');
        $this->assertSame($r->id, $c['id']);
        $this->postJson($base.'/runs/'.$r->id.'/events', ['generation' => $c['generation'], 'events' => [['type' => 'status', 'text' => 'Working in Cloud']]], $h)->assertOk();
        $this->postJson($base.'/runs/'.$r->id.'/complete', ['generation' => $c['generation'], 'answer' => 'Saved checklist'], $h)->assertOk()->assertJsonPath('run.state', 'completed');
        $this->assertDatabaseCount('agent_runs', 1);
    }
    public function test_workspace_replacement_and_expired_compute_fence_runner_writes(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey']; $r = $this->admit($p);
        $base = '/api/agents/v2/runner/'.$p['runtimeId']; $h = ['X-Vibyra-Runner-Key' => $key];
        $c = $this->postJson($base.'/claim', [], $h)->assertOk()->json('run');
        DB::table('cloud_workspaces')->where('id', $this->cid)->increment('generation');
        $this->postJson($base.'/runs/'.$r->id.'/heartbeat', ['generation' => $c['generation']], $h)
            ->assertStatus(409)->assertJsonPath('code', 'cloud_compute_unavailable');
        DB::table('cloud_workspaces')->where('id', $this->cid)->decrement('generation');
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->subSecond()]);
        $this->postJson($base.'/claim', [], $h)->assertStatus(409);
    }
    public function test_rotation_refuses_previous_runner_key_and_wrong_selected_account(): void
    {
        $p = $this->policy(); $old = $this->register($p)['runnerKey']; $new = $this->register($p)['runnerKey'];
        $this->assertNotSame($old, $new);
        $this->postJson('/api/agents/v2/runner/'.$p['runtimeId'].'/claim', [], ['X-Vibyra-Runner-Key' => $old])->assertStatus(403);
        $this->asRuntime($this->cloudToken, 'post', 'agents/register', ['generation' => $this->row()->generation,
            'runtimeId' => $p['runtimeId'], 'provider' => 'claude', 'accountId' => 'other', 'model' => 'sonnet', 'effort' => 'high',
            'capabilities' => ['controlledTools' => true, 'taskSteering' => true]])->assertStatus(409);
    }
    public function test_replaced_cloud_account_fences_the_old_binding_without_inheriting_authority(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey'];
        $this->asRuntime($this->cloudToken, 'post', 'agents/accounts', ['generation' => $this->row()->generation,
            'accounts' => [['provider' => 'claude', 'accountId' => 'cloud-replacement', 'label' => 'Another account',
                'authenticated' => true, 'models' => ['sonnet'], 'efforts' => ['high']]]])->assertOk();
        $this->postJson('/api/agents/v2/runner/'.$p['runtimeId'].'/claim', [], ['X-Vibyra-Runner-Key' => $key])->assertStatus(409);
        $this->getJson('/api/agents/v2/cloud')->assertOk()->assertJsonPath('policy.enabled', false);
    }

    public function test_runtime_cannot_create_user_authority_or_use_other_workspace(): void
    {
        $this->asRuntime($this->cloudToken, 'get', 'agents/next')->assertOk()->assertJsonPath('selection', null);
        $this->asRuntime('wrong-token', 'get', 'agents/next')->assertStatus(401);
        $this->getJson('/api/agents/v2/cloud', ['X-Vibyra-Runner-Key' => str_repeat('a', 64)])->assertStatus(403);
    }
    public function test_stop_after_approval_sleep_can_resume_without_replaying_finished_actions(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey']; $r = $this->admit($p);
        $base = '/api/agents/v2/runner/'.$p['runtimeId']; $h = ['X-Vibyra-Runner-Key' => $key];
        $c = $this->postJson($base.'/claim', [], $h)->assertOk()->json('run');
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['last_activity_at' => now()->subHour()]);
        $this->assertNull(app(\App\Services\CloudComputer\Idle::class)->stopReason($this->row()));
        DB::table('agent_runs')->where('id', $r->id)->update(['state' => 'waiting_for_approval']);
        $this->assertSame('idle', app(\App\Services\CloudComputer\Idle::class)->stopReason($this->row()));
    }
}
