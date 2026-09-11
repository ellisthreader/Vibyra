<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

/**
 * Auto across the whole path: the phone sends the literal string, the quote resolves
 * it to a real model and a real level, and the queued job replays exactly that to
 * OpenRouter. Asserting the quote alone would pass while the provider was still
 * being sent the old constant.
 */
class VibesAutoQuoteTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'vibes-auto-session';
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        VibesCatalogue::put();
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        $this->withToken($this->token);
    }

    private function chat(bool $paid = true): string
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        if ($paid) app(Wallet::class)->grant($this->user->id, 'test-topup', 'topup', 500);
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Auto'])->assertOk();

        return $id;
    }

    private function quote(string $text, string $model = 'auto', ?string $effort = null, bool $paid = true): array
    {
        return $this->postJson('/api/vibes/quote', array_filter(
            ['chatId' => $this->chat($paid), 'text' => $text, 'model' => $model, 'effort' => $effort],
            fn ($value) => $value !== null,
        ))->assertOk()->json();
    }

    public function test_auto_resolves_to_a_real_model_and_says_why(): void
    {
        $quote = $this->quote('implement a debounce function in typescript');

        $this->assertNotSame('auto', $quote['model']);
        $this->assertArrayHasKey($quote['model'], (array) config('vibes.models'), 'Auto chooses a curated model');
        $this->assertNotEmpty($quote['auto']['reason']);
        $this->assertSame(config('vibes.models')[$quote['model']]['name'], $quote['auto']['name']);
    }

    /** The point of the whole exercise, at the level a person would notice it. */
    public function test_a_hard_prompt_and_an_easy_one_do_not_get_the_same_model(): void
    {
        $easy = $this->quote('what is the git command to undo the last commit?');
        $hard = $this->quote('we have a race condition in the payment settlement path. find the root '
            .'cause, prove it cannot lose a settlement, and keep the handler idempotent.');

        $this->assertNotSame($easy['model'], $hard['model']);
        $this->assertGreaterThan($easy['maxCredits'], $hard['maxCredits']);
    }

    public function test_an_explicitly_chosen_model_is_left_alone(): void
    {
        $quote = $this->quote('what is the git command to undo the last commit?', 'anthropic/claude-opus-5');

        $this->assertSame('anthropic/claude-opus-5', $quote['model']);
        $this->assertNull($quote['auto'], 'nothing was routed, so there is nothing to explain');
    }

    /**
     * The composer hides the effort chip for Auto, so any level arriving beside it is
     * one the person cannot see and cannot change - a stale value left over from the
     * last model they picked. Honouring it would price a turn at a level nobody chose.
     */
    public function test_a_stale_effort_sent_alongside_auto_is_ignored(): void
    {
        $plain = $this->quote('write a haiku about recursion');
        $stale = $this->quote('write a haiku about recursion', 'auto', 'max');

        $this->assertSame($plain['effort'], $stale['effort']);
        $this->assertSame($plain['maxCredits'], $stale['maxCredits'], 'a hidden level must not raise the price');
    }

    public function test_the_routed_model_and_effort_reach_the_provider(): void
    {
        Http::fake(['*' => Http::response(['id' => 'gen-1', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['content' => 'Done.']]]])]);

        $quote = $this->quote('the parser deadlocks on nested inputs. diagnose the concurrency bug '
            .'and propose a thread-safe rewrite.');
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);

        Http::assertSent(fn ($request) => $request['model'] === $quote['model']
            && ($request['reasoning']['effort'] ?? null) === $quote['effort']);
    }

    /** A free account holds only trial credit, so Auto must stay inside what it funds. */
    public function test_a_free_account_is_routed_to_a_model_its_trial_credit_can_fund(): void
    {
        $quote = $this->quote('design a distributed rate limiter that survives a node dying mid-window',
            'auto', null, paid: false);

        $id = (string) Str::uuid();
        // A model trial credit cannot fund is refused here with 402, so reaching 202
        // is the assertion: the router chose one the account can actually send to.
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
    }
}
