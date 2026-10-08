<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Str as StrFacade};
use Illuminate\Support\Str;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

/**
 * The reasoning effort has to survive the whole path - phone, quote, encrypted
 * request, queued job - and reach OpenRouter's body. Asserting the quote response
 * alone would pass while the provider was still being sent nothing.
 */
class VibesEffortTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    private string $token = 'vibes-effort-session';
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        $user = $this->user;
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        $this->withToken($this->token);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            // A published ladder, stored ascending exactly as the normalizer leaves it.
            'anthropic/claude-fable-5.1' => ['pricing' => ['prompt' => '0.000003', 'completion' => '0.000015'],
                'supported_parameters' => ['tools', 'reasoning'], 'created' => 1_780_000_000,
                'reasoning' => ['mandatory' => true, 'default_effort' => 'high',
                    'supported_efforts' => ['low', 'medium', 'high', 'xhigh', 'max']]],
            // Reasoning as a switch, with no levels to choose between.
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'reasoning'], 'reasoning' => ['mandatory' => false, 'default_enabled' => true]],
        ]]);
    }

    private function chat(): string
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        // Fable 5.1 is an uncurated catalogue model, so trial credit can never fund
        // it. Paid Vibes are what make these turns reach the provider at all.
        app(Wallet::class)->grant($this->user->id, 'test-topup', 'topup', 500);
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Build a timer'])->assertOk();
        return $id;
    }

    private function quote(string $model, ?string $effort = null): array
    {
        return $this->postJson('/api/vibes/quote', array_filter(
            ['chatId' => $this->chat(), 'text' => 'Build a timer', 'model' => $model, 'effort' => $effort],
            fn ($value) => $value !== null,
        ))->assertOk()->json();
    }

    public function test_the_catalogue_publishes_each_model_s_own_ladder(): void
    {
        $models = collect($this->getJson('/api/vibes/models')->assertOk()->json('models'))->keyBy('id');

        $this->assertSame(['low', 'medium', 'high', 'xhigh', 'max'], $models['anthropic/claude-fable-5.1']['reasoning']['efforts']);
        $this->assertSame('high', $models['anthropic/claude-fable-5.1']['reasoning']['defaultEffort']);
        $this->assertTrue($models['anthropic/claude-fable-5.1']['reasoning']['mandatory']);
        // A switch, not a dial: no ladder, so the phone shows no effort control.
        $this->assertSame([], $models['qwen/qwen3.8-flash']['reasoning']['efforts']);
    }

    public function test_the_chosen_effort_reaches_the_openrouter_request_body(): void
    {
        Http::fake(['*' => Http::response(['id' => 'gen-1', 'usage' => ['cost' => 0.002],
            'choices' => [['message' => ['content' => 'Here is a timer.']]]])]);

        $quote = $this->quote('anthropic/claude-fable-5.1', 'xhigh');
        $this->assertSame('xhigh', $quote['effort']);

        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);

        Http::assertSent(fn ($request) => ($request['reasoning']['effort'] ?? null) === 'xhigh'
            && $request['model'] === 'anthropic/claude-fable-5.1');
    }

    public function test_a_deeper_level_buys_a_bigger_answer_envelope_and_costs_more(): void
    {
        $low = $this->quote('anthropic/claude-fable-5.1', 'low');
        $max = $this->quote('anthropic/claude-fable-5.1', 'max');

        // The same number prices the turn and caps max_tokens, so thinking cannot
        // consume the answer budget without the price saying so first.
        $this->assertGreaterThan($low['maxCredits'], $max['maxCredits']);
    }

    public function test_an_unsupported_level_is_replaced_by_the_model_s_default_and_reported(): void
    {
        // 'none' is not on a mandatory reasoner's ladder, so it cannot be honoured.
        $quote = $this->quote('anthropic/claude-fable-5.1', 'none');
        $this->assertSame('high', $quote['effort'], 'The quote reports the level it actually priced.');
    }

    public function test_a_model_with_no_ladder_is_sent_no_reasoning_at_all(): void
    {
        Http::fake(['*' => Http::response(['id' => 'gen-2', 'usage' => ['cost' => 0.0001],
            'choices' => [['message' => ['content' => 'Done.']]]])]);

        $quote = $this->quote('qwen/qwen3.8-flash', 'high');
        $this->assertNull($quote['effort']);

        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);

        Http::assertSent(fn ($request) => ! array_key_exists('reasoning', $request->data()));
    }

    public function test_a_level_outside_openrouter_s_vocabulary_never_reaches_the_service(): void
    {
        $this->postJson('/api/vibes/quote', ['chatId' => $this->chat(), 'text' => 'Hi',
            'model' => 'anthropic/claude-fable-5.1', 'effort' => 'ultracode'])->assertStatus(422);
    }

    public function test_an_empty_answer_is_not_charged_and_does_not_burn_a_trial_chat(): void
    {
        // Reasoning can consume the whole envelope and leave no room to answer. The
        // person receives nothing, so the person pays nothing.
        Http::fake(['*' => Http::response(['id' => 'gen-3', 'usage' => ['cost' => 0.004],
            'choices' => [['message' => ['content' => '']]]])]);

        $quote = $this->quote('anthropic/claude-fable-5.1', 'max');
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);

        $turn = DB::table('vibes_turns')->where('id', $id)->first();
        $this->assertSame(0, (int) $turn->charged, 'An empty reply is never charged.');
        $this->assertNull(DB::table('vibes_chats')->where('id', $turn->chat_id)->value('trial_slot'),
            'A failed first reply releases the trial chat.');
        // 100 trial + the 500 topup, all of it returned: nothing was spent.
        $this->assertSame(600, (int) $this->getJson('/api/vibes/wallet')->json('wallet.available'));
    }
}
