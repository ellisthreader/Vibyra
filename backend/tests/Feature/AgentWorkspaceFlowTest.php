<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use App\Services\Agents\Teammates;
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class AgentWorkspaceFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_granted_mac_read_resumes_the_agent_and_other_clients_cannot_answer_it(): void
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true, 'vibes.enabled' => true,
            'services.openrouter.key' => 'test-only', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Http::preventStrayRequests();
        VibesCatalogue::put();
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'mac-session'), 'device_name' => 'Mac']);
        $this->withToken('mac-session');
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-mac-read', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Reviewer',
            'brief' => 'Read the project.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => []]);
        $hostId = str_repeat('a', 64);
        $workspace = $this->postJson('/api/agents/v1/workspaces', ['agentId' => $agent['id'],
            'hostId' => $hostId, 'label' => 'Sample project'])->assertOk()->json('workspace');
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'], 'Read README.md.', 'auto');
        $request = json_decode(Crypt::decryptString($quote['quote']), true);
        $this->assertStringContainsString('read-only tools', $request['request']['messages'][0]['content']);
        $this->assertStringNotContainsString('no computer tools', $request['request']['messages'][0]['content']);
        $offered = array_column(array_column($request['request']['tools'], 'function'), 'name');
        $this->assertContains('read_file', $offered);
        $this->assertContains('git_status', $offered);
        $this->assertContains('git_diff', $offered);
        $this->assertNotContains('write_file', $offered);
        $this->assertNotContains('git_status', array_column(array_column(\App\Services\Vibes\AgentTools::definitions(), 'function'), 'name'));
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $request);
        Http::fake(['openrouter.ai/*' => Http::sequence()->push(['id' => 'read-step', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => [[
                'id' => 'call-read', 'type' => 'function', 'function' => ['name' => 'read_file',
                    'arguments' => '{"path":"README.md"}']]]]]]])
            ->push(['id' => 'answer-step', 'usage' => ['cost' => 0.002],
                'choices' => [['message' => ['role' => 'assistant', 'content' => 'README describes the app.']]]])]);
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $turnId)->firstOrFail();
        $this->assertSame($workspace['id'], $tool->agent_workspace_id);
        $this->getJson('/api/agents/v1/teammates')->assertOk()
            ->assertJsonPath('teammates.0.status', 'computer_offline');
        $this->assertGreaterThan(now()->addDays(6)->timestamp,
            app(\App\Services\Vibes\AgentTools::class)->payload($turnId)[0]['expiresAt']);
        $this->travel(16)->minutes();
        $this->artisan('vibyra:recover-vibes')->assertExitCode(0);
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'waiting']);
        $this->travelBack();
        $this->getJson($path.'/pending')->assertStatus(403);
        $this->getJson($path.'/pending', ['X-Vibyra-Runner-Key' => str_repeat('x', 64)])->assertStatus(403);
        $other = User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-session'), 'device_name' => 'Other']);
        $this->withToken('other-session')->getJson($path.'/pending', $header)->assertNotFound();
        $this->withToken('mac-session');
        $this->postJson('/api/vibes/tools/'.$tool->id.'/result', ['decision' => 'allow', 'result' => ['content' => 'fake']])
            ->assertStatus(422);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools.0.id', $tool->id)
            ->assertJsonPath('tools.0.arguments.path', 'README.md');
        $this->getJson('/api/agents/v1/teammates')->assertOk()
            ->assertJsonPath('teammates.0.status', 'waiting_for_tool');
        $this->postJson($path.'/tools/'.$tool->id.'/result', ['result' => ['content' => 'README describes the app.']], $header)->assertOk();
        $this->postJson($path.'/tools/'.$tool->id.'/result', ['result' => ['content' => 'README describes the app.']], $header)->assertOk();
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'completed']);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $second = json_decode(Crypt::decryptString(app(Quotes::class)->create($user->id, $agent['chatId'],
            'Read README.md again.', 'auto')['quote']), true);
        $secondId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $secondId, $second);
        DB::table('vibes_tools')->insert(['id' => (string) Str::uuid(), 'turn_id' => $secondId,
            'provider_id' => 'call-read-again', 'operation' => 'read_file', 'agent_workspace_id' => $workspace['id'],
            'arguments' => '{"path":"README.md"}', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('vibes_turns')->where('id', $secondId)->update(['status' => 'waiting']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $secondId, 'status' => 'waiting']);
        $this->deleteJson($path)->assertOk();
        $this->assertDatabaseHas('vibes_turns', ['id' => $secondId, 'status' => 'failed']);
        $this->getJson($path.'/pending', $header)->assertNotFound();
    }
}
