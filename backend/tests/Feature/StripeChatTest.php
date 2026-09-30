<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class StripeChatTest extends TestCase
{
    use RefreshDatabase;

    public static function scenarios(): array { return ['Monthly payments' => ['revenue'], 'Final step answers' => ['laststep']]; }

    #[\PHPUnit\Framework\Attributes\DataProvider('scenarios')]
    public function test_stripe_reads_tool_totals_then_settles_once_without_exposing_credentials(string $scenario): void
    {
        config(['vibes.enabled' => true, 'chat_connectors.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['guest_at' => now(), 'provider' => 'guest']);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'guest'), 'device_name' => 'iPhone']);
        $this->withToken('guest');
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake(); Http::preventStrayRequests();
        Http::fake(['api.stripe.com/v1/account' => Http::response(['id' => 'acct_test', 'settings' => ['dashboard' => ['display_name' => 'Test Business']]])]);
        $this->postJson('/api/connectors/stripe/connect', ['credential' => 'private-fixture-token'])->assertOk();
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Review'])->assertOk();
        $prompt = '@stripe this whole account is my project. How much did it collect this month in UTC?';
        $q = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $prompt,
            'model' => 'qwen/qwen3.8-flash', 'integrations' => ['stripe']])->assertOk()->json();
        $answer = 'Test data: GBP 60.00 collected after GBP 20.00 refunds, before fees. https://dashboard.stripe.com/test/payments';
        $calls = [['id' => 'revenue', 'type' => 'function', 'function' => ['name' => 'stripe_revenue', 'arguments' => '{"scope":"account"}']]];
        Http::fake([
            'openrouter.ai/*' => Http::sequence()->push(['id' => 'first', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => [
                'role' => 'assistant', 'content' => null, 'tool_calls' => $calls,
            ]]]])->push(['id' => 'second', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => ['content' => $answer]]]]),
            'api.stripe.com/v1/charges*' => Http::response(['has_more' => false, 'data' => [[
                'id' => 'ch_test', 'paid' => true, 'captured' => true, 'status' => 'succeeded', 'livemode' => false,
                'amount_captured' => 8000, 'amount_refunded' => 2000, 'currency' => 'gbp',
            ]]]),
        ]);
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'queued']);
        if ($scenario === 'laststep') DB::table('vibes_turns')->where('id', $id)->update(['step_count' => 3]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'completed')
            ->assertJsonPath('turn.response', $answer)->assertJsonMissingPath('turn.tools.0.result');
        Http::assertSent(function ($r) use ($calls, $scenario) {
            if (!str_contains($r->url(), 'openrouter.ai')) return false;
            $messages = $r['messages'];
            return ($scenario !== 'laststep' || !isset($r['tools'])) && str_contains(json_encode($messages), '60.00') && str_contains(json_encode($messages), 'never assert real earnings') && count(array_filter($messages, fn ($m) => $m['role'] === 'tool')) === count($calls)
                && !str_contains(json_encode($r->data()), 'private-fixture-token');
        });
        $before = DB::table('vibes_turns')->where('id', $id)->value('charged');
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertSame($before, DB::table('vibes_turns')->where('id', $id)->value('charged'));
    }
}
