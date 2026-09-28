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

class AgentToolApprovalFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_everyday_github_issue_task_needs_one_approval_and_runs_once(): void
    {
        config(['vibes.enabled' => true, 'agents.enabled' => true, 'chat_connectors.enabled' => true,
            'services.openrouter.key' => 'test-only', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Http::preventStrayRequests();
        VibesCatalogue::put();
        $user = User::factory()->create();
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($user->id, 'agent-tool-flow', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $model = Http::sequence()->push(['id' => 'first', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['role' => 'assistant', 'content' => null,
                'tool_calls' => [['id' => 'call-issue', 'type' => 'function', 'function' => [
                    'name' => 'github_create_issue',
                    'arguments' => '{"repository":"fixture/repo","title":"Fix login"}']]]]]]])
            ->push(['id' => 'second', 'usage' => ['cost' => 0.002],
                'choices' => [['message' => ['role' => 'assistant', 'content' => 'Opened issue #42.']]]]);
        Http::fake(['api.github.com/user' => Http::response(['login' => 'fixture']),
            'api.github.com/repos/fixture/repo/issues' => Http::response([
                'number' => 42, 'title' => 'Fix login', 'html_url' => 'https://github.com/fixture/repo/issues/42'], 201),
            'openrouter.ai/*' => $model]);
        app(Installs::class)->connect($user->id, 'github', 'fixture-only');
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Helper',
            'brief' => 'Handle GitHub tasks.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => ['github']]);
        $quote = app(Quotes::class)->create($user->id, $agent['chatId'], 'Open a login bug in fixture/repo.', 'auto');
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        $turnId = (string) Str::uuid();
        app(Turns::class)->submit($user->id, $turnId, $data);
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $turnId)->first();
        $this->assertSame('pending', $tool->action_state);
        Http::assertNotSent(fn ($request) => $request->method() === 'POST' && str_contains($request->url(), 'api.github.com'));

        try { app(ToolActions::class)->decide($user->id, $tool->id, 'stale-fingerprint', 'allow'); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        try { app(ToolActions::class)->decide($user->id, $tool->id, $tool->action_hash, 'maybe'); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        app(ToolActions::class)->decide($user->id, $tool->id, $tool->action_hash, 'allow');
        app(ToolActions::class)->execute($tool->id);
        app(ToolActions::class)->execute($tool->id);
        app()->call([new RunVibesTurn($turnId), 'handle']);
        $this->assertDatabaseHas('vibes_tools', ['id' => $tool->id, 'action_state' => 'completed', 'action_answer' => 'allow']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $turnId, 'status' => 'completed']);
        Http::assertSentCount(4);
        $this->assertSame(1, Http::recorded(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), 'api.github.com'))->count());
    }
}
