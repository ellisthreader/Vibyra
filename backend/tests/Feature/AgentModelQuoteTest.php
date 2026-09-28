<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Services\Agents\Teammates;
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class AgentModelQuoteTest extends TestCase
{
    use RefreshDatabase;

    private int $user;
    private string $chat;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'agents.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Http::preventStrayRequests();
        VibesCatalogue::put();
        $user = User::factory()->create();
        $this->user = $user->id;
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($this->user, 'agent-routing-test', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $this->user)->update(['consented_at' => now()]);
        $a = app(Teammates::class)->save($this->user, ['id' => (string) Str::uuid(), 'name' => 'Builder',
            'brief' => 'Review projects and plan implementation.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => []]);
        $this->chat = $a['chatId'];
    }

    private function quote(string $model = 'auto', ?string $effort = null): array
    {
        return app(Quotes::class)->create($this->user, $this->chat, 'Review the project and draft an implementation plan.', $model, $effort);
    }

    public function test_agent_auto_reaches_the_worker_with_the_quoted_model_and_budget(): void
    {
        $quote = $this->quote(effort: 'max');
        $this->assertSame('anthropic/claude-sonnet-5', $quote['model']);
        $this->assertSame('medium', $quote['effort']);
        $this->assertNotEmpty($quote['auto']['reason']);
        $this->assertLessThanOrEqual(20, $quote['maxCredits']);
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        $this->assertSame(8, $data['request']['vibyraAgent']['maxSteps']);
        $this->assertFalse($data['request']['provider']['allow_fallbacks']);
        $id = (string) Str::uuid();
        app(Turns::class)->submit($this->user, $id, $data);
        Http::fake(['*' => Http::response(['id' => 'agent-test-generation', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['role' => 'assistant', 'content' => 'Here is the plan.']]]])]);
        app()->call([new RunVibesTurn($id), 'handle']);
        Http::assertSent(fn ($request) => $request['model'] === $quote['model']
            && $request['reasoning']['effort'] === $quote['effort']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'completed']);
    }

    public function test_saved_engine_is_default_and_explicit_message_model_still_wins(): void
    {
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['model' => 'openai/gpt-5.6-luna']);
        $this->assertSame('openai/gpt-5.6-luna', $this->quote()['model']);
        $this->assertSame('google/gemini-3.8-flash', $this->quote('google/gemini-3.8-flash')['model']);
    }

    public function test_provider_preference_routes_within_its_family_and_keeps_explicit_overrides(): void
    {
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['model' => 'provider:openai']);
        $quote = $this->quote();
        $this->assertStringStartsWith('openai/', $quote['model']);
        $this->assertLessThanOrEqual(20, $quote['maxCredits']);
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        $this->assertSame($quote['model'], $data['request']['model']);
        $this->assertSame('provider:openai', $data['selection']);
        $this->assertSame('google/gemini-3.8-flash', $this->quote('google/gemini-3.8-flash')['model']);
    }

    public function test_unavailable_provider_never_silently_switches_companies(): void
    {
        config(['vibes_auto.models' => ['google/gemini-3.8-flash']]);
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['model' => 'provider:openai']);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->quote();
    }

    public function test_manual_model_and_effort_are_preserved(): void
    {
        $quote = $this->quote('openai/gpt-5.6-luna', 'low');
        $this->assertSame('openai/gpt-5.6-luna', $quote['model']);
        $this->assertSame('low', $quote['effort']);
        $this->assertNull($quote['auto']);
    }

    public function test_agent_budget_is_used_during_selection(): void
    {
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['budget' => 2]);
        $quote = $this->quote();
        $this->assertSame('google/gemini-3.8-flash', $quote['model']);
        $this->assertLessThanOrEqual(2, $quote['maxCredits']);
    }

    public function test_routed_connector_write_waits_for_approval_and_decline_keeps_the_same_model(): void
    {
        config(['chat_connectors.enabled' => true]);
        Http::fake(['api.github.com/user' => Http::response(['login' => 'fixture'])]);
        app(\App\Services\ChatConnectors\Installs::class)->connect($this->user, 'github', 'fixture-only');
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['integrations' => '["github"]']);
        $quote = $this->quote();
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        $id = (string) Str::uuid();
        app(Turns::class)->submit($this->user, $id, $data);
        $details = [['type' => 'reasoning.text', 'text' => 'Fixture reasoning state.']];
        Http::fakeSequence()->push(['id' => 'agent-tool-first', 'usage' => ['cost' => 0.002], 'choices' => [['message' => [
            'role' => 'assistant', 'content' => null, 'reasoning_details' => $details,
            'tool_calls' => [['id' => 'fixture-call', 'type' => 'function', 'function' => [
                'name' => 'github_create_issue', 'arguments' => '{"repository":"fixture/repo","title":"Review"}']]],
        ]]]])->push(['id' => 'agent-tool-second', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['content' => 'The issue was not created.']]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $id)->first();
        $this->assertSame('pending', $tool->action_state);
        Queue::assertNotPushed(\App\Jobs\RunAgentTool::class);
        app(\App\Services\Agents\ToolActions::class)->decide($this->user, $tool->id, $tool->action_hash, 'decline');
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'completed']);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST' && str_contains($r->url(), 'api.github.com'));
        Http::assertSent(function ($r) use ($quote, $details) {
            $messages = $r['messages'] ?? [];
            $assistant = collect($messages)->firstWhere('role', 'assistant');
            $tool = collect($messages)->firstWhere('role', 'tool');
            return $r['model'] === $quote['model'] && ($assistant['reasoning_details'] ?? null) === $details
                && isset($tool['content']) && json_decode($tool['content'], true) === ['declined' => true];
        });
    }

    public function test_queued_connector_write_without_exact_approval_cannot_execute(): void
    {
        config(['chat_connectors.enabled' => true]);
        Http::fake(['api.github.com/user' => Http::response(['login' => 'fixture'])]);
        app(\App\Services\ChatConnectors\Installs::class)->connect($this->user, 'github', 'fixture-only');
        DB::table('agent_teammates')->where('chat_id', $this->chat)->update(['integrations' => '["github"]']);
        $data = json_decode(Crypt::decryptString($this->quote()['quote']), true);
        $id = (string) Str::uuid();
        app(Turns::class)->submit($this->user, $id, $data);
        Http::fakeSequence()->push(['id' => 'agent-tool-first', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['role' => 'assistant', 'content' => null,
                'tool_calls' => [['id' => 'fixture-call', 'type' => 'function', 'function' => [
                    'name' => 'github_create_issue', 'arguments' => '{"repository":"fixture/repo","title":"Review"}']]]]]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $id)->first();
        $this->assertSame('pending', $tool->action_state);

        // Simulate a queued row from a faulty queue path. No decision was given.
        DB::table('vibes_tools')->where('id', $tool->id)->update(['action_state' => 'queued']);
        app(\App\Services\Agents\ToolActions::class)->execute($tool->id);
        $this->assertDatabaseHas('vibes_tools', ['id' => $tool->id, 'action_state' => 'expired', 'action_answer' => null]);
        Http::assertNotSent(fn ($request) => $request->method() === 'POST' && str_contains($request->url(), 'api.github.com'));
    }
}
