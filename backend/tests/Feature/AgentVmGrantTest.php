<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Agents\Teammates;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentVmGrantTest extends TestCase
{
    use RefreshDatabase;

    public function test_shell_test_permission_needs_its_own_enabled_edit_grant(): void
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true,
            'agents.vm_tests_enabled' => false]);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id,
            'token_hash' => hash('sha256', 'vm-grant-session'), 'device_name' => 'Mac']);
        $this->withToken('vm-grant-session');
        app(Wallet::class)->ensure($user);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(),
            'name' => 'Tester', 'brief' => 'Test the granted project.', 'avatar' => 'assistant',
            'budget' => 20, 'integrations' => []]);
        $base = ['agentId' => $agent['id'], 'hostId' => str_repeat('a', 64),
            'label' => 'Project', 'platform' => 'macos'];
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('capabilities.vmTests', false);
        $this->postJson('/api/agents/v1/workspaces', $base + ['canWrite' => true, 'canTest' => true])
            ->assertStatus(422);
        config(['agents.vm_tests_enabled' => true]);
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('capabilities.vmTests', true);
        $this->postJson('/api/agents/v1/workspaces', $base + ['canWrite' => false, 'canTest' => true])
            ->assertStatus(422);
        $edit = $this->postJson('/api/agents/v1/workspaces', $base + ['canWrite' => true])
            ->assertOk()->json('workspace');
        $this->assertFalse($edit['canTest']);
        $test = $this->postJson('/api/agents/v1/workspaces', $base + ['canWrite' => true, 'canTest' => true])
            ->assertOk()->json('workspace');
        $this->assertTrue($test['canTest']);
        $this->assertSame(1, DB::table('agent_workspaces')->where('id', $test['id'])->value('can_test'));
    }

    public function test_non_mac_computers_keep_their_platform_and_cannot_get_vm_tests(): void
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true,
            'agents.vm_tests_enabled' => true]);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id,
            'token_hash' => hash('sha256', 'platform-session'), 'device_name' => 'Computer']);
        $this->withToken('platform-session');
        app(Wallet::class)->ensure($user);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(),
            'name' => 'Tester', 'brief' => 'Inspect the project.', 'avatar' => 'assistant',
            'budget' => 20, 'integrations' => []]);
        foreach (['linux', 'windows'] as $platform) {
            $hostId = str_repeat($platform === 'linux' ? 'b' : 'c', 64);
            $base = ['agentId' => $agent['id'], 'hostId' => $hostId,
                'label' => 'Project', 'platform' => $platform, 'canWrite' => true];
            $this->postJson('/api/agents/v1/workspaces', $base + ['canTest' => true])
                ->assertStatus(422);
            $this->postJson('/api/agents/v1/workspaces', $base)->assertOk()
                ->assertJsonPath('workspace.canTest', false);
            $this->assertSame($platform, DB::table('remote_hosts')->where('host_id', $hostId)->value('platform'));
            DB::table('remote_hosts')->where('host_id', $hostId)->update(['platform' => 'macos']);
            $this->postJson('/api/agents/v1/workspaces', $base)->assertOk();
            $this->assertSame($platform, DB::table('remote_hosts')->where('host_id', $hostId)->value('platform'));
        }
        $unknown = ['agentId' => $agent['id'], 'hostId' => str_repeat('d', 64),
            'label' => 'Legacy client', 'canWrite' => true, 'canTest' => true];
        $this->postJson('/api/agents/v1/workspaces', $unknown)->assertStatus(422);
        DB::table('remote_hosts')->where('host_id', str_repeat('c', 64))
            ->update(['platform' => 'macos']);
        $unknown['hostId'] = str_repeat('c', 64);
        $this->postJson('/api/agents/v1/workspaces', $unknown)->assertStatus(422);
    }
}
