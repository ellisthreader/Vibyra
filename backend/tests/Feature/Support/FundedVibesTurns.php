<?php

namespace Tests\Feature\Support;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Cache, DB, Http};
use Illuminate\Support\Str;

/**
 * A funded phone chat run end to end against a stubbed OpenRouter: sign in, quote, submit and run
 * the job. Provider answers are queued with `answers()`; every request the stub saw is in
 * `Http::recorded()`. Shared by the prompt-caching and provider-failover tests.
 */
trait FundedVibesTurns
{
    use PinnedVibesTrial;

    private User $user;
    /** @var array<int, callable|\Illuminate\Http\Client\Response|\GuzzleHttp\Promise\PromiseInterface> */
    private array $queue = [];

    private function fundedSetUp(array $models = []): void
    {
        $this->pinTrial();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'funded-session'), 'device_name' => 'iPhone']);
        $this->withToken('funded-session');
        $this->snapshot($models);
        Http::fake(['*' => function () {
            $next = array_shift($this->queue);
            if ($next === null) throw new \RuntimeException('The stubbed provider was called more often than the test expected.');
            return is_callable($next) ? $next() : $next;
        }]);
    }

    /** The cached OpenRouter pricing snapshot the quote and the failover read. */
    private function snapshot(array $models = []): void
    {
        $text = ['supported_parameters' => ['tools'], 'context_length' => 200000, 'output_modalities' => ['text'], 'input_modalities' => ['text']];
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(),
            'models' => array_map(fn ($pricing) => ['pricing' => $pricing] + $text, $models ?: [
                'qwen/qwen3.8-flash' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'google/gemini-3.8-flash' => ['prompt' => '0.0000001', 'completion' => '0.0000004'],
                'anthropic/claude-haiku-4.5' => ['prompt' => '0.000001', 'completion' => '0.000005'],
            ])]);
    }

    /** Queue what the provider answers to each call, in order. */
    private function answers(mixed ...$answers): void
    {
        $this->queue = $answers;
    }

    private function ok(float $cost, array $usage = [], string $text = 'Done.'): \Illuminate\Http\Client\Response|\GuzzleHttp\Promise\PromiseInterface
    {
        return Http::response(['id' => 'gen-'.Str::random(6), 'choices' => [['message' => ['content' => $text]]],
            'usage' => ['cost' => $cost, ...$usage]], 200);
    }

    private function failing(int $status = 503): \Illuminate\Http\Client\Response|\GuzzleHttp\Promise\PromiseInterface
    {
        return Http::response(['error' => ['code' => $status, 'message' => 'Provider returned error', 'metadata' => ['provider_name' => 'Stubbed']]], $status);
    }

    /** Quotes and submits one turn in `$chat` (created when null) without running it. Returns [turnId, chatId]. */
    private function submit(string $model = 'qwen/qwen3.8-flash', ?string $chat = null, string $text = 'Build a timer'): array
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        if (! DB::table('vibes_ledger')->where('reference', 'like', 'test-topup-%')->where('user_id', $this->user->id)->exists()) {
            app(Wallet::class)->grant($this->user->id, 'test-topup-'.Str::uuid(), 'topup', 500);
            $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        }
        if ($chat === null) {
            $chat = (string) Str::uuid();
            $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Build a timer'])->assertOk();
        }
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $text, 'model' => $model])->assertOk()->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        return [$id, $chat];
    }

    private function execute(string $id): object
    {
        app()->call([new RunVibesTurn($id), 'handle']);
        return DB::table('vibes_turns')->where('id', $id)->first();
    }

    private function runTurn(string $model = 'qwen/qwen3.8-flash', ?string $chat = null): object
    {
        return $this->execute($this->submit($model, $chat)[0]);
    }

    private function settlement(string $turnId): array
    {
        $row = DB::table('vibes_ledger')->where('reference', 'settle:'.$turnId)->first();
        return $row ? json_decode($row->metadata, true) : [];
    }

    /** @return array<int, array> the decoded JSON body of every call the stub saw. */
    private function sent(): array
    {
        return array_map(fn ($r) => $r[0]->data(), Http::recorded()->all());
    }
}
