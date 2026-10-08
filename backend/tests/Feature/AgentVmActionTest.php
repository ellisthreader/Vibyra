<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Agents\{Teammates, ToolActions, VmTestAction};
use App\Services\Vibes\{AgentTools, Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class AgentVmActionTest extends TestCase
{
    use RefreshDatabase;

    private function setupAction(): array
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true,
            'agents.vm_tests_enabled' => true, 'vibes.enabled' => true,
            'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake(); Http::preventStrayRequests(); VibesCatalogue::put();
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id,
            'token_hash' => hash('sha256', 'vm-action-session'), 'device_name' => 'Mac']);
        $this->withToken('vm-action-session');
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-vm-test', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(),
            'name' => 'Tester', 'brief' => 'Test a shell script.', 'avatar' => 'assistant',
            'budget' => 20, 'integrations' => []]);
        $workspace = $this->postJson('/api/agents/v1/workspaces', ['agentId' => $agent['id'],
            'hostId' => str_repeat('a', 64), 'label' => 'Test worktree', 'platform' => 'macos',
            'canWrite' => true, 'canTest' => true])->assertOk()->json('workspace');
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'], 'Run the selected shell test.', 'auto');
        $request = json_decode(Crypt::decryptString($quote['quote']), true);
        $offered = array_column(array_column($request['request']['tools'], 'function'), 'name');
        $this->assertContains('run_test', $offered);
        $this->assertStringContainsString('BusyBox', $request['request']['messages'][0]['content']);
        $this->assertStringNotContainsString('You cannot run commands or tests', $request['request']['messages'][0]['content']);
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $request);
        DB::table('vibes_turns')->where('id', $turnId)->update(['status' => 'waiting']);
        $toolId = (string) Str::uuid();
        $args = VmTestAction::arguments(['script' => 'tests/check.sh',
            'files' => [['path' => 'tests/check.sh', 'sha256' => hash('sha256', 'echo TEST')]],
            'timeoutSeconds' => 30]);
        DB::table('vibes_tools')->insert(['id' => $toolId, 'turn_id' => $turnId,
            'provider_id' => 'call-test', 'operation' => 'run_test',
            'agent_workspace_id' => $workspace['id'], 'arguments' => json_encode($args),
            'created_at' => now(), 'updated_at' => now()]);
        return [$user, $workspace, $turnId, $toolId, $args, $request];
    }

    public function test_shell_test_needs_exact_approval_claim_and_matching_receipt(): void
    {
        [$user, $workspace, $turnId, $toolId, $args] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $tool = DB::table('vibes_tools')->where('id', $toolId)->firstOrFail();
        $this->assertSame('pending', $tool->action_state);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $tool->action_hash], $header)->assertStatus(409);
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $tool->action_hash, 'decision' => 'allow'])->assertOk();
        $this->getJson($path.'/pending', $header)->assertOk()
            ->assertJsonPath('tools.0.operation', 'run_test')
            ->assertJsonPath('tools.0.arguments.files.0.sha256', $args['files'][0]['sha256']);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => str_repeat('f', 64)], $header)->assertStatus(409);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $tool->action_hash], $header)->assertOk();
        $receipt = ['script' => $args['script'], 'files' => $args['files'],
            'snapshot' => str_repeat('a', 64), 'exitCode' => 7, 'timedOut' => false,
            'output' => 'TEST FAILED'];
        $changed = $receipt; $changed['files'][0]['sha256'] = str_repeat('b', 64);
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $changed], $header)->assertStatus(422);
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'completed',
            'result' => json_encode($receipt)]);
    }

    public function test_test_access_can_be_disabled_after_approval(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        config(['agents.vm_tests_enabled' => false]);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertStatus(409);
    }

    public function test_host_platform_change_stops_an_approved_vm_test(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        DB::table('remote_hosts')->where('host_id', $workspace['hostId'])->update(['platform' => 'linux']);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)
            ->assertStatus(409);
    }

    public function test_private_path_and_changed_hash_are_not_valid_test_arguments(): void
    {
        $args = ['script' => '.env', 'files' => [['path' => '.env', 'sha256' => str_repeat('a', 64)]],
            'timeoutSeconds' => 30];
        try { VmTestAction::arguments($args); $this->fail('Private test path was accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        $args['script'] = 'tests/check.sh'; $args['files'][0]['path'] = 'tests/check.sh';
        $args['files'][0]['sha256'] = 'changed';
        try { VmTestAction::arguments($args); $this->fail('Unpinned test file was accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }

    public function test_model_call_is_bound_to_the_offered_tool_and_current_test_grant(): void
    {
        [, , $turnId, $toolId, $args] = $this->setupAction();
        DB::table('vibes_tools')->where('id', $toolId)->delete();
        $turn = DB::table('vibes_turns')->where('id', $turnId)->firstOrFail();
        $message = ['role' => 'assistant', 'content' => null, 'tool_calls' => [[
            'id' => 'call-pinned-test', 'type' => 'function',
            'function' => ['name' => 'run_test', 'arguments' => json_encode($args)],
        ]]];
        app(AgentTools::class)->awaitTools($turn, $message, 0);
        $saved = DB::table('vibes_tools')->where('provider_id', 'call-pinned-test')->firstOrFail();
        $this->assertSame('run_test', $saved->operation);
        $this->assertSame($args, json_decode($saved->arguments, true));
    }

    public function test_claimed_shell_test_becomes_unconfirmed_when_access_is_revoked(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $this->deleteJson($path)->assertOk();
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'unknown']);
        $turn = DB::table('vibes_turns')->where('id', $turnId)->firstOrFail();
        $this->assertSame('failed', $turn->status);
        $this->assertStringContainsString('shell test', $turn->error);
    }

    public function test_timeout_receipt_has_no_exit_code(): void
    {
        $args = VmTestAction::arguments(['script' => 'tests/check.sh',
            'files' => [['path' => 'tests/check.sh', 'sha256' => str_repeat('a', 64)]],
            'timeoutSeconds' => 5]);
        $result = ['script' => $args['script'], 'files' => $args['files'],
            'snapshot' => str_repeat('b', 64), 'exitCode' => null,
            'timedOut' => true, 'output' => 'started'];
        VmTestAction::receipt($args, $result);
        $result['exitCode'] = 0;
        try { VmTestAction::receipt($args, $result); $this->fail('Timeout claimed success'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }

    public function test_restarted_mac_can_settle_a_claim_without_replaying_the_guest(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $error = ['error' => 'A previous shell-test dispatch ended without a confirmed result.'];
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $error], $header)->assertOk();
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'completed',
            'summary' => 'Mac shell test result was not confirmed.', 'result' => json_encode($error)]);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
    }
}
