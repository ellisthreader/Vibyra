<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Jobs\PublishAgentBranch;
use App\Services\Agents\{Teammates, ToolActions};
use App\Services\Agents\BranchPublication\{BranchAction, Manifest};
use App\Services\Agents\BranchPublication\BranchDelivery;
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\Support\BranchGithubFixture;
use Tests\TestCase;

class AgentBranchDeliveryTest extends TestCase
{
    use RefreshDatabase;
    use BranchGithubFixture;

    private function setupAction(): array
    {
        config(['agents.enabled' => true, 'agents.local_runner_enabled' => true,
            'agents.git_publish_enabled' => true, 'chat_connectors.enabled' => true,
            'vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake(); Http::preventStrayRequests(); VibesCatalogue::put();
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id,
            'token_hash' => hash('sha256', 'publish-session'), 'device_name' => 'Mac']);
        $this->withToken('publish-session');
        DB::table('vibes_integration_installs')->insert(['user_id' => $user->id,
            'integration' => 'github', 'credential' => Crypt::encryptString('fixture-token'),
            'account_label' => 'fixture', 'connected_at' => now(),
            'created_at' => now(), 'updated_at' => now()]);
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-publish-flow', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(),
            'name' => 'Publisher', 'brief' => 'Review code changes.', 'avatar' => 'assistant',
            'budget' => 20, 'integrations' => ['github']]);
        $workspace = $this->postJson('/api/agents/v1/workspaces', [
            'agentId' => $agent['id'], 'hostId' => str_repeat('a', 64),
            'label' => 'Edit worktree', 'canWrite' => true])->assertOk()->json('workspace');
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'],
            'Publish my reviewed Agent branch to fixture/repo.', 'auto');
        $request = json_decode(Crypt::decryptString($quote['quote']), true);
        $offered = array_column(array_column($request['request']['tools'], 'function'), 'name');
        $this->assertContains(BranchAction::PREVIEW, $offered);
        $this->assertContains(BranchAction::PUBLISH, $offered);
        $publishSchema = collect($request['request']['tools'])->first(fn ($tool) =>
            ($tool['function']['name'] ?? '') === BranchAction::PUBLISH)['function']['parameters'];
        $this->assertSame(['repository', 'baseBranch', 'message', 'snapshotSha256'],
            $publishSchema['required']);
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $request);
        DB::table('vibes_turns')->where('id', $turnId)->update(['status' => 'waiting']);
        $base = str_repeat('a', 40); $branch = 'vibyra-agent/'.$workspace['id'];
        $file = ['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null,
            'sha256' => hash('sha256', "after\n"), 'mode' => '100644', 'bytes' => 6];
        $snapshot = ['baseSha' => $base, 'branch' => $branch, 'files' => [$file],
            'snapshotSha256' => Manifest::digest($base, $branch, [$file])];
        $args = BranchAction::arguments(BranchAction::PUBLISH, [
            'repository' => 'fixture/repo', 'baseBranch' => 'main', 'message' => 'Fix login',
            'snapshot' => $snapshot], $workspace['id']);
        $toolId = (string) Str::uuid();
        DB::table('vibes_tools')->insert(['id' => $toolId, 'turn_id' => $turnId,
            'provider_id' => 'call-publish', 'operation' => BranchAction::PUBLISH,
            'agent_workspace_id' => $workspace['id'], 'arguments' => json_encode($args),
            'created_at' => now(), 'updated_at' => now()]);
        $upload = $snapshot;
        $upload['files'][0]['contentBase64'] = base64_encode("after\n");
        return [$user, $workspace, $turnId, $toolId, $upload];
    }

    public function test_exact_approval_claim_and_byte_upload_publish_once(): void
    {
        [$user, $workspace, $turnId, $toolId, $upload] = $this->setupAction();
        $path = '/api/agents/v1/workspaces/'.$workspace['id'];
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        $this->fakeGithub($upload['branch']);
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $url = $path.'/tools/'.$toolId.'/publish';
        $this->postJson($url, ['snapshot' => $upload], $header)->assertStatus(409);
        Http::assertNothingSent();
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson($url, ['snapshot' => $upload], $header)->assertStatus(409);
        $this->postJson($path.'/tools/'.$toolId.'/claim', ['fingerprint' => $hash], $header)->assertOk();
        $changed = $upload; $changed['files'][0]['contentBase64'] = base64_encode("other\n");
        $this->postJson($url, ['snapshot' => $changed], $header)->assertStatus(422);
        Http::assertNothingSent();
        $this->postJson($url, ['snapshot' => $upload], $header)->assertStatus(202)
            ->assertJsonPath('result.accepted', true);
        $this->postJson($url, ['snapshot' => $upload], $header)->assertStatus(409);
        Http::assertNothingSent();
        $queued = Queue::pushed(PublishAgentBranch::class);
        $this->assertCount(1, $queued);
        $job = $queued->first();
        $job->handle(app(BranchDelivery::class));
        $job->handle(app(BranchDelivery::class));
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'completed']);
        $this->assertTrue(json_decode(DB::table('vibes_tools')->where('id', $toolId)->value('result'), true)['published']);
        $this->assertSame(1, Http::recorded(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/git/refs'))->count());
    }

    public function test_disconnect_after_approval_refuses_before_github_write(): void
    {
        [$user, $workspace, $turnId, $toolId, $upload] = $this->setupAction();
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        DB::table('vibes_integration_installs')->where('user_id', $user->id)->delete();
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$toolId.'/claim',
            ['fingerprint' => $hash], $header)->assertStatus(409);
        Http::assertNothingSent();
    }

    public function test_mac_preview_result_keeps_significant_git_status_spaces(): void
    {
        [, $workspace, $turnId, , $upload] = $this->setupAction();
        $previewId = (string) Str::uuid();
        DB::table('vibes_tools')->insert(['id' => $previewId, 'turn_id' => $turnId,
            'provider_id' => 'call-preview', 'operation' => BranchAction::PREVIEW,
            'agent_workspace_id' => $workspace['id'], 'arguments' => '{}',
            'created_at' => now(), 'updated_at' => now()]);
        unset($upload['files'][0]['contentBase64']);
        $bad = $upload; $bad['files'][0]['path'] = '.env';
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$previewId.'/result',
            ['result' => $bad], ['X-Vibyra-Runner-Key' => $workspace['runnerKey']])->assertStatus(422);
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$previewId.'/result',
            ['result' => $upload], ['X-Vibyra-Runner-Key' => $workspace['runnerKey']])->assertOk();
        $saved = DB::table('vibes_tools')->where('id', $previewId)->value('result');
        $this->assertSame(' M', json_decode($saved, true)['files'][0]['status']);
        $turn = DB::table('vibes_turns')->where('id', $turnId)->firstOrFail();
        $proposal = ['repository' => 'fixture/repo', 'baseBranch' => 'main',
            'message' => 'Fix login', 'snapshotSha256' => $upload['snapshotSha256']];
        app(\App\Services\Vibes\AgentTools::class)->awaitTools($turn,
            ['role' => 'assistant', 'tool_calls' => [['id' => 'call-from-preview',
                'function' => ['name' => BranchAction::PUBLISH, 'arguments' => json_encode($proposal)]]]], 0);
        $approved = json_decode(DB::table('vibes_tools')->where('provider_id', 'call-from-preview')
            ->value('arguments'), true);
        $this->assertSame($upload['files'][0]['sha256'], $approved['snapshot']['files'][0]['sha256']);
        $proposal['snapshotSha256'] = str_repeat('f', 64);
        try { BranchAction::proposal($proposal, $workspace['id'], $turnId); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $proposal['snapshotSha256'] = $upload['snapshotSha256'];
        try { BranchAction::proposal($proposal, $workspace['id'], (string) Str::uuid()); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    public function test_expired_started_publication_is_unknown_and_never_replayed(): void
    {
        [$user, $workspace, $turnId, $toolId] = $this->setupAction();
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$toolId.'/claim',
            ['fingerprint' => $hash], $header)->assertOk();
        DB::table('vibes_tools')->where('id', $toolId)->update(['action_state' => 'publishing']);
        $this->travel(16)->minutes();
        $this->artisan('vibyra:recover-vibes')->assertExitCode(0);
        $this->assertDatabaseHas('vibes_tools', ['id' => $toolId, 'action_state' => 'unknown']);
        $this->assertStringContainsString('GitHub branch outcome is unconfirmed',
            DB::table('vibes_turns')->where('id', $turnId)->value('error'));
        Http::assertNothingSent();
    }

    public function test_worker_rechecks_github_connection_after_the_upload_is_queued(): void
    {
        [$user, $workspace, $turnId, $toolId, $upload] = $this->setupAction();
        $header = ['X-Vibyra-Runner-Key' => $workspace['runnerKey']];
        app(ToolActions::class)->prepare($turnId, $user->id);
        $hash = DB::table('vibes_tools')->where('id', $toolId)->value('action_hash');
        $this->postJson('/api/agents/v1/decisions/'.$toolId,
            ['fingerprint' => $hash, 'decision' => 'allow'])->assertOk();
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$toolId.'/claim',
            ['fingerprint' => $hash], $header)->assertOk();
        $this->postJson('/api/agents/v1/workspaces/'.$workspace['id'].'/tools/'.$toolId.'/publish',
            ['snapshot' => $upload], $header)->assertStatus(202);
        DB::table('vibes_integration_installs')->where('user_id', $user->id)->delete();
        Queue::pushed(PublishAgentBranch::class)->first()->handle(app(BranchDelivery::class));
        Http::assertNothingSent();
        $result = json_decode(DB::table('vibes_tools')->where('id', $toolId)->value('result'), true);
        $this->assertTrue($result['refused']);
    }
}
