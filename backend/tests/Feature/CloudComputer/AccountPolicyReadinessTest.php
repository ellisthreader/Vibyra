<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\HostActivity;
use Illuminate\Support\Facades\DB;

class AccountPolicyReadinessTest extends SyncTestCase
{
    private function off(string $provider = 'claude'): \Illuminate\Testing\TestResponse
    {
        return $this->putJson('/api/cloud-computer/access/providers/'.$provider, ['enabled' => false]);
    }

    public function test_an_old_active_host_cannot_claim_to_turn_an_ai_account_off(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $token = $this->computerReady();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 1, 'waitingApproval' => 0])->assertOk();
        foreach (['ready', 'starting', 'stopping', 'recovery_required'] as $state) {
            DB::table('cloud_workspaces')->where('id', $this->cid)->update(['state' => $state]);
            foreach (['claude', 'codex'] as $provider) $this->off($provider)->assertStatus(409)->assertJsonPath('code', 'cloud_update_required');
        }
        $this->assertSame(0, DB::table('cloud_access_settings')->count());
        $this->assertSame(1, (int) $this->row()->host_running);
        // GitHub is enforced by the backend and does not require a Host upgrade.
        $this->putJson('/api/cloud-computer/access/integrations/github', ['enabled' => false])->assertOk();
    }

    public function test_the_reported_capability_enables_the_current_generation_only(): void
    {
        $token = $this->computerReady();
        $body = ['running' => 0, 'waitingApproval' => 0, 'providerPolicyVersion' => 1];
        $this->asRuntime($token, 'post', 'host/activity', $body)->assertOk();
        $this->off()->assertOk();
        $old = $this->row();
        $this->sleepNow();
        $this->assertSame(0, (int) $this->row()->host_provider_policy_version);
        $this->putJson('/api/cloud-computer/access/providers/claude', ['enabled' => true])->assertOk();
        $this->wake()->assertStatus(202);
        $this->assertSame(0, (int) $this->row()->host_provider_policy_version);
        app(HostActivity::class)->record($old, $body);
        $this->assertSame(0, (int) $this->row()->host_provider_policy_version, 'An old in-flight report cannot authorize its replacement.');
        $this->asRuntime($token, 'post', 'host/activity', $body)->assertStatus(401);
        $this->off()->assertStatus(409)->assertJsonPath('code', 'cloud_update_required');
    }

    public function test_absent_and_stopped_computers_can_save_choices_for_their_next_start(): void
    {
        $this->off()->assertOk();
        $this->createComputer();
        $this->off('codex')->assertOk();
        $this->assertSame('stopped', $this->row()->state);
        $this->assertSame(0, DB::table('cloud_computer_wakes')->count());
    }

    public function test_reconnect_cannot_bypass_the_old_host_gate_or_keep_partial_choices(): void
    {
        $this->computerReady();
        config(['cloud_workspaces.connect_requires_face' => false]);
        $before = DB::table('cloud_connect_consents')->count();
        $this->postJson('/api/cloud-computer/connect', ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version'),
            'projects' => [['id' => 'new', 'name' => 'New project']], 'accounts' => ['claude' => false]])
            ->assertStatus(409)->assertJsonPath('code', 'cloud_update_required');
        $this->assertSame($before, DB::table('cloud_connect_consents')->count());
        $this->assertSame(0, DB::table('cloud_project_access')->count());
        $this->assertSame(0, DB::table('cloud_access_settings')->count());
        $this->assertSame('ready', $this->row()->state);
    }
}
