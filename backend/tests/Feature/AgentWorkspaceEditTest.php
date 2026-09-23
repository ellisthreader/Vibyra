<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Agents\{Teammates, ToolActions};
use App\Services\Vibes\{AgentTools, Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class AgentWorkspaceEditTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(bool $canWrite): array
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true, 'vibes.enabled' => true,
            'services.openrouter.key' => 'test-only', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Http::preventStrayRequests();
        VibesCatalogue::put();
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'edit-session'), 'device_name' => 'Mac']);
        $this->withToken('edit-session');
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-mac-edit', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Editor',
            'brief' => 'Edit the project.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => []]);
        $workspace = $this->postJson('/api/agents/v1/workspaces', ['agentId' => $agent['id'],
            'hostId' => str_repeat('a', 64), 'label' => 'Sample project', 'canWrite' => $canWrite])
            ->assertOk()->json('workspace');
        $this->assertSame($canWrite, $workspace['canWrite']);
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'], 'Edit notes.txt.', 'auto');
        $request = json_decode(Crypt::decryptString($quote['quote']), true);
        $offered = array_column(array_column($request['request']['tools'], 'function'), 'name');
        $this->assertSame($canWrite, in_array('write_file', $offered, true));
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $request);
        DB::table('vibes_turns')->where('id', $turnId)->update(['status' => 'waiting']);
        $toolId = (string) Str::uuid();
        DB::table('vibes_tools')->insert(['id' => $toolId, 'turn_id' => $turnId,
            'provider_id' => 'call-edit', 'operation' => 'write_file', 'agent_workspace_id' => $workspace['id'],
            'arguments' => json_encode(['path' => 'notes.txt', 'content' => 'Approved note', 'expectedSha256' => 'new']),
            'created_at' => now(), 'updated_at' => now()]);
        return [$user, $workspace, $turnId, $toolId];
    }

    public function test_mac_edit_waits_for_exact_approval_and_accepts_one_receipt(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $tool = DB::table('vibes_tools')->where('id', $toolId)->firstOrFail();
        $this->assertSame('pending', $tool->action_state);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => ['written' => true]], $header)->assertStatus(409);
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => str_repeat('f', 64), 'decision' => 'allow'])->assertStatus(409);
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $tool->action_hash, 'decision' => 'allow'])->assertOk();
        $this->getJson($path.'/pending', $header)->assertOk()
            ->assertJsonPath('tools.0.id', $toolId)->assertJsonPath('tools.0.approval.state', 'queued')
            ->assertJsonPath('tools.0.approval.fingerprint', $tool->action_hash);
        $this->postJson('/api/vibes/tools/'.$toolId.'/result',
            ['decision' => 'allow', 'result' => ['written' => true]])->assertStatus(422);
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => ['written' => true]], $header)->assertStatus(409);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => str_repeat('f', 64)], $header)->assertStatus(409);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $tool->action_hash], $header)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $tool->action_hash], $header)->assertOk();
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools.0.approval.state', 'dispatching');
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => ['written' => true]], $header)->assertStatus(422);
        $receipt = ['written' => true, 'path' => 'notes.txt', 'sha256' => hash('sha256', 'Approved note')];
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => ['written' => true]], $header)->assertStatus(409);
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'completed',
            'action_answer' => 'allow', 'result' => json_encode($receipt)]);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
    }

    public function test_decline_never_queues_a_mac_edit(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'decline'])->assertOk();
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'declined', 'action_answer' => 'decline']);
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertStatus(409);
    }

    public function test_read_only_grant_cannot_queue_a_write_even_if_a_row_is_inserted(): void
    {
        [$user, $workspace, $turnId] = $this->workspace(false);
        try { app(ToolActions::class)->prepare($turnId, $user->id); $this->fail('Read-only edit was prepared'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        $this->getJson('/api/agents/v1/workspaces/'.$workspace['id'].'/pending',
            ['X-Vibyra-Runner-Key' => $workspace['runnerKey']])->assertOk()->assertJsonPath('tools', []);
    }

    public function test_expired_approval_and_revoked_grant_cannot_run_a_write(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->travel(16)->minutes();
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertStatus(409);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertStatus(409);
        $this->getJson($path.'/pending', $header)->assertOk()->assertJsonPath('tools', []);
        $this->travelBack();
        $this->deleteJson($path)->assertOk();
        $this->getJson($path.'/pending', $header)->assertNotFound();
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'failed']);
    }

    public function test_uncertain_mac_receipt_is_saved_once_and_stops_the_turn(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $receipt = ['error' => 'The Mac could not confirm the write.'];
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/result', ['result' => $receipt], $header)->assertOk();
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'unknown',
            'result' => json_encode($receipt)]);
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'failed']);
    }

    public function test_revocation_after_claim_records_an_in_flight_edit_as_uncertain(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $this->deleteJson($path)->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertNotFound();
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'unknown']);
        $turn = DB::table('vibes_turns')->where('id', $turnId)->firstOrFail();
        $this->assertSame('failed', $turn->status);
        $this->assertStringContainsString('Check the file on your Mac', $turn->error);
    }

    public function test_lost_mac_receipt_expires_as_uncertain_after_claim(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->workspace(true);
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $this->travel(16)->minutes();
        $this->artisan('vibyra:recover-vibes')->assertExitCode(0);
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'unknown']);
        $turn = DB::table('vibes_turns')->where('id', $turnId)->firstOrFail();
        $this->assertSame('failed', $turn->status);
        $this->assertStringContainsString('Check the file before trying again', $turn->error);
        $this->travelBack();
    }
}
