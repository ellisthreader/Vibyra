<?php
namespace Tests\Feature;

use App\Services\AgentRuns\RuntimeBindings;
use Illuminate\Support\Facades\DB;

final class AgentCloudPolicyTest extends AgentCloudTestCase
{
    public function test_selection_consumes_quote_and_requires_compare_and_swap(): void
    {
        $body = $this->policyBody();
        $p = $this->putJson('/api/agents/v2/cloud', $body)->assertOk()->json('policy');
        $this->assertSame(1, $p['revision']);
        $this->assertSame(200000, $p['remainingBudgetUnits']);
        $this->assertNotNull(DB::table('agent_cloud_quotes')->where('id', $body['quoteId'])->value('accepted_at'));
        $this->putJson('/api/agents/v2/cloud', $this->policyBody())->assertStatus(409);
        $this->deleteJson('/api/agents/v2/cloud', ['expectedRevision' => 2])->assertStatus(409);
        $this->deleteJson('/api/agents/v2/cloud', ['expectedRevision' => 1])->assertOk()->assertJsonPath('policy.enabled', false);
    }
    public function test_changing_account_creates_new_binding_and_preserves_old_task_identity(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey']; $r = $this->admit($p);
        $claim = $this->postJson('/api/agents/v2/runner/'.$p['runtimeId'].'/claim', [], ['X-Vibyra-Runner-Key' => $key])->assertOk()->json('run');
        $this->asRuntime($this->cloudToken, 'post', 'agents/accounts', ['generation' => $this->row()->generation,
            'accounts' => [['provider' => 'claude', 'accountId' => 'cloud-new', 'label' => 'New account', 'authenticated' => true, 'models' => ['sonnet'], 'efforts' => ['high']]]])->assertOk();
        $new = $this->putJson('/api/agents/v2/cloud', $this->policyBody(['expectedRevision' => 1, 'accountId' => 'cloud-new']))->assertOk()->json('policy');
        $this->assertNotSame($p['runtimeId'], $new['runtimeId']);
        $this->assertSame('cloud', $r->fresh()->runtime_snapshot['accountRef']);
        $old = \App\Models\AgentV2\RuntimeBinding::findOrFail($p['runtimeId']);
        $this->assertSame('cloud', $old->account_ref);
        $this->assertNotNull($old->revoked_at);
        $registered = $this->asRuntime($this->cloudToken, 'post', 'agents/register', ['generation' => $this->row()->generation,
            'runtimeId' => $new['runtimeId'], 'provider' => 'claude', 'accountId' => 'cloud-new', 'model' => 'sonnet', 'effort' => 'high',
            'capabilities' => ['controlledTools' => true, 'taskSteering' => true]])->assertOk()->json();
        $this->postJson('/api/agents/v2/runner/'.$new['runtimeId'].'/runs/'.$r->id.'/heartbeat', ['generation' => $claim['generation']],
            ['X-Vibyra-Runner-Key' => $registered['runnerKey']])->assertStatus(404);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agentId, 'runtimeId' => $p['runtimeId'],
            'idempotencyKey' => 'stale-send', 'prompt' => 'Do not retarget'])->assertStatus(409);
    }

    public function test_no_implicit_cloud_selection_or_inference_funding(): void
    {
        $p = $this->policy();
        $r = $this->admit($p);
        $this->assertSame('connected_account', $r->funding_source);
        $this->assertSame('cloud', $r->runtime_snapshot['executionTarget']);
        $this->assertSame($this->cid, $r->runtime_snapshot['cloudWorkspaceId']);
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        app(RuntimeBindings::class)->select($this->user->id, null);
    }
    public function test_unobserved_account_and_unsupported_provider_are_refused(): void
    {
        $this->putJson('/api/agents/v2/cloud', $this->policyBody(['accountId' => 'another']))->assertStatus(409);
        $this->putJson('/api/agents/v2/cloud', $this->policyBody(['provider' => 'codex']))->assertStatus(422);
        $this->putJson('/api/agents/v2/cloud', $this->policyBody(['model' => 'unlisted']))->assertStatus(422);
    }
    public function test_stale_inventory_is_not_authentication_and_price_changes_refuse_save(): void
    {
        $body = $this->policyBody();
        DB::table('agent_cloud_accounts')->update(['reported_at' => now()->subMinutes(3)]);
        $this->putJson('/api/agents/v2/cloud', $body)->assertStatus(409);
        $this->reportAccounts();
        config(['cloud_workspaces.tariff_version' => 'changed']);
        $this->putJson('/api/agents/v2/cloud', $body)->assertStatus(409);
    }
    public function test_revoked_session_and_account_switch_disable_saved_authority(): void
    {
        $p = $this->policy();
        DB::table('vibyra_sessions')->where('id', $this->session->id)->update(['revoked_at' => now()]);
        $this->assertFalse(app(\App\Services\AgentRuns\Cloud\Policies::class)->payload($this->user->id)['policy']['enabled']);
        $this->asRuntime($this->cloudToken, 'get', 'agents/next')->assertOk()->assertJsonPath('selection', null);
    }
}
