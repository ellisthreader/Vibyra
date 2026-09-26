<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Phone Chat contract: selected model/effort, personal context, memory and one wallet settlement. */
class VibesChatReadinessTest extends TestCase
{
    use RefreshDatabase;
    private string $chat;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'chat-readiness'), 'device_name' => 'iPhone']);
        $this->withToken('chat-readiness');
        Queue::fake(); Http::preventStrayRequests();
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['max_tokens', 'reasoning'],
                'reasoning' => ['mandatory' => false, 'default_effort' => 'low', 'supported_efforts' => ['low', 'high']]],
        ]]);
        $this->chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $this->chat, 'title' => 'Readiness test'])->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
    }

    private function quote()
    {
        return $this->postJson('/api/vibes/quote', ['chatId' => $this->chat, 'text' => 'Remember that I prefer TypeScript.',
            'model' => 'qwen/qwen3.8-flash', 'effort' => 'high']);
    }

    public function test_model_effort_personality_memory_and_wallet_work_together(): void
    {
        $this->postJson('/api/vibes/preferences', ['name' => 'Sam', 'style' => 'concise',
            'instructions' => 'Use small examples.', 'memoryEnabled' => true])->assertOk();
        $this->postJson('/api/vibes/memories', ['text' => 'Builds an iPhone app.'])->assertOk();
        $before = $this->getJson('/api/vibes/wallet')->assertOk()->json('wallet.available');
        $quote = $this->quote()->assertOk()->assertJsonPath('effort', 'high')->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.held', $quote['maxCredits']);
        Http::fake(['*' => Http::response(['id' => 'gen-readiness', 'usage' => ['cost' => 0.001],
            'choices' => [['message' => ['content' => "Noted.\n<vibyra-memory>Prefers TypeScript.</vibyra-memory>"]]]])]);
        app()->call([new RunVibesTurn($id), 'handle']);
        app()->call([new RunVibesTurn($id), 'handle']);
        Http::assertSentCount(1);
        Http::assertSent(function ($sent) {
            $system = $sent['messages'][0]['content'];
            return $sent['model'] === 'qwen/qwen3.8-flash' && $sent['reasoning']['effort'] === 'high'
                && $sent['usage']['include'] === true && $sent['provider']['require_parameters'] === true
                && str_contains($system, 'Name: Sam') && str_contains($system, 'Keep replies brief')
                && str_contains($system, 'Use small examples.') && str_contains($system, 'Builds an iPhone app.');
        });
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'completed')
            ->assertJsonPath('turn.response', 'Noted.')->assertJsonPath('turn.charged', 1)
            ->assertJsonPath('turn.memory.saved.0.text', 'Prefers TypeScript.');
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.held', 0)->assertJsonPath('wallet.available', $before - 1);
        $this->assertSame(1, DB::table('vibes_turns')->count());
    }

    public function test_an_unconfigured_provider_cannot_advertise_chat_readiness_or_reserve_vibes(): void
    {
        $quote = $this->quote()->assertOk()->json('quote');
        config(['services.openrouter.key' => '']);
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.chatEnabled', false);
        $this->quote()->assertStatus(503);
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $quote])->assertStatus(503);
        $this->assertSame(0, DB::table('vibes_turns')->count());
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.held', 0);
        Queue::assertNothingPushed(); Http::assertNothingSent();
    }

    public function test_null_effort_metadata_matches_openrouter_and_the_phone_selector(): void
    {
        $key = (string) config('billing.openrouter_pricing.cache_key');
        $snapshot = Cache::get($key);
        $snapshot['models']['qwen/qwen3.8-flash']['reasoning'] = ['supported_efforts' => null, 'mandatory' => true];
        Cache::put($key, $snapshot);
        $this->assertSame(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
            app(\App\Services\Vibes\Catalog::class)->efforts('qwen/qwen3.8-flash'));
    }

    public function test_a_large_unicode_memory_and_chat_can_submit_the_quote_it_received(): void
    {
        $this->postJson('/api/vibes/preferences', ['summary' => str_repeat('東京', 4000)])->assertOk();
        $userId = DB::table('vibes_chats')->where('id', $this->chat)->value('user_id');
        foreach (range(1, 12) as $i) DB::table('vibes_turns')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $userId, 'chat_id' => $this->chat, 'digest' => str_repeat('0', 64),
            'model' => 'qwen/qwen3.8-flash', 'status' => 'completed', 'request' => '{}', 'allocations' => '[]',
            'prompt' => str_repeat('Question ', 70), 'response' => str_repeat('Answer ', 180), 'reserved' => 1,
            'settled_at' => now(), 'created_at' => now()->subMinutes(20 - $i), 'updated_at' => now(),
        ]);
        $quote = $this->quote()->assertOk()->json('quote');
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $quote])->assertStatus(202);
    }
}
