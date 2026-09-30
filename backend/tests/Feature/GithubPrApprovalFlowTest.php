<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Services\Agents\{Teammates, ToolActions};
use App\Services\ChatConnectors\Installs;
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class GithubPrApprovalFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_pr_waits_for_exact_approval_then_opens_once(): void
    {
        config(['vibes.enabled' => true, 'agents.enabled' => true, 'agents.github_pr_enabled' => true,
            'chat_connectors.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake(); Http::preventStrayRequests(); VibesCatalogue::put();
        $user = User::factory()->create();
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-pr-flow', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $head = str_repeat('a', 40); $base = str_repeat('b', 40);
        $arguments = json_encode(['repository' => 'fixture/repo', 'head' => 'vibyra-agent/fix',
            'base' => 'main', 'expectedHeadSha' => $head, 'expectedBaseSha' => $base,
            'title' => 'Fix login', 'body' => 'Focused regression test included.', 'draft' => true]);
        Http::fake([
            'api.github.com/user' => Http::response(['login' => 'fixture']),
            'api.github.com/repos/fixture/repo/git/ref/heads/vibyra-agent/fix' => Http::response([
                'ref' => 'refs/heads/vibyra-agent/fix', 'object' => ['type' => 'commit', 'sha' => $head]]),
            'api.github.com/repos/fixture/repo/git/ref/heads/main' => Http::response([
                'ref' => 'refs/heads/main', 'object' => ['type' => 'commit', 'sha' => $base]]),
            'api.github.com/repos/fixture/repo/pulls' => Http::response([
                'number' => 12, 'title' => 'Fix login', 'body' => 'Focused regression test included.', 'draft' => true,
                'html_url' => 'https://github.com/fixture/repo/pull/12',
                'head' => ['ref' => 'vibyra-agent/fix', 'sha' => $head, 'repo' => ['full_name' => 'fixture/repo']],
                'base' => ['ref' => 'main', 'sha' => $base, 'repo' => ['full_name' => 'fixture/repo']],
            ], 201),
            'openrouter.ai/*' => Http::sequence()->push(['id' => 'first', 'usage' => ['cost' => 0.002],
                'choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => [[
                    'id' => 'call-pr', 'type' => 'function', 'function' => [
                        'name' => 'github_create_pull_request', 'arguments' => $arguments],
                ]]]]]])->push(['id' => 'second', 'usage' => ['cost' => 0.002],
                    'choices' => [['message' => ['role' => 'assistant', 'content' => 'Opened draft PR #12.']]]]),
        ]);
        app(Installs::class)->connect($user->id, 'github', 'fixture-only');
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Helper',
            'brief' => 'Handle GitHub tasks.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => ['github']]);
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'],
            'Open a draft PR from vibyra-agent/fix into main at these exact commits.', 'auto');
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $data);
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $turnId)->first();
        $this->assertSame('pending', $tool->action_state);
        $this->assertSame(json_decode($arguments, true), json_decode($tool->arguments, true));
        Http::assertNotSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/pulls'));
        try { app(ToolActions::class)->decide($user->id, $tool->id, 'stale-fingerprint', 'allow'); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        app(ToolActions::class)->decide($user->id, $tool->id, $tool->action_hash, 'allow');
        app(ToolActions::class)->execute($tool->id);
        app(ToolActions::class)->execute($tool->id);
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $this->assertDatabaseHas('vibes_tools', ['id' => $tool->id, 'action_state' => 'completed', 'action_answer' => 'allow']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'completed']);
        $this->assertSame(1, Http::recorded(fn ($r) => $r->method() === 'POST'
            && str_ends_with($r->url(), '/pulls'))->count());
    }
}
