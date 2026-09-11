<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB};
use Tests\TestCase;

/**
 * What a free account may spend its trial credit on. The line is a price, so a
 * provider reposting one moves it without anybody editing a list — which is the
 * whole point: the old hand-set flags had Haiku 4.5 at $5.00/M out marked free.
 */
class VibesFreeTierTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        $price = fn ($in, $out) => ['pricing' => ['prompt' => (string) ($in / 1000000), 'completion' => (string) ($out / 1000000)],
            'supported_parameters' => ['tools']];
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            // Curated, and comfortably inside both ceilings.
            'qwen/qwen3.8-flash' => $price(0.15, 0.47),
            'openai/gpt-oss-120b' => $price(0.04, 0.17),
            // Curated, and right on the ceiling.
            'anthropic/claude-haiku-4.5' => $price(1.00, 5.00),
            // Curated flagships, far past it.
            'anthropic/claude-opus-5' => $price(5.00, 25.00),
            'x-ai/grok-4.6' => $price(2.00, 6.00),
            // Dearer than anything the ceiling admits, and not named in `free_extra`,
            // which ships empty. The tests that want it named say so themselves.
            'openai/gpt-5.5' => $price(5.00, 30.00),
            // Cheap, but not curated: never trial-funded whatever it costs.
            'someone/uncurated-model' => $price(0.01, 0.02),
        ]]);
    }

    public function test_curated_models_within_the_ceiling_are_included_free(): void
    {
        $catalog = app(Catalog::class);
        $this->assertTrue($catalog->includedFree('qwen/qwen3.8-flash'));
        $this->assertTrue($catalog->includedFree('openai/gpt-oss-120b'));
        $this->assertTrue($catalog->includedFree('anthropic/claude-haiku-4.5'), '$5.00/M out sits on the ceiling');
        // The flagships stay behind it, which is the whole point of having one.
        $this->assertFalse($catalog->includedFree('x-ai/grok-4.6'), '$6.00/M out is past the ceiling');
        $this->assertFalse($catalog->includedFree('anthropic/claude-opus-5'));
    }

    public function test_an_explicit_pick_is_included_however_dear_or_uncurated(): void
    {
        // GPT-5.5 is $30/M out, twenty-five times the old ceiling and dearer than
        // Opus 5, which stays locked. A ceiling high enough to reach it would have
        // swept in every flagship, so it is named instead.
        config(['vibes.free_extra' => ['openai/gpt-5.5']]);
        $catalog = app(Catalog::class);
        $this->assertTrue($catalog->includedFree('openai/gpt-5.5'));
        $this->assertFalse($catalog->includedFree('anthropic/claude-opus-5'), 'Naming one model frees only that model');
        $this->assertTrue($catalog->resolve('openai/gpt-5.5')['trial']);
    }

    public function test_emptying_the_picks_leaves_only_the_price_rule(): void
    {
        config(['vibes.free_extra' => []]);
        $this->assertFalse(app(Catalog::class)->includedFree('openai/gpt-5.5'));
        $this->assertTrue(app(Catalog::class)->includedFree('qwen/qwen3.8-flash'));
    }

    public function test_a_cheap_uncurated_model_is_still_not_free(): void
    {
        // It carries no tier and no written blurb, so nothing has vetted it.
        $this->assertFalse(app(Catalog::class)->includedFree('someone/uncurated-model'));
        $this->assertFalse(app(Catalog::class)->resolve('someone/uncurated-model')['trial']);
    }

    public function test_the_published_catalogue_agrees_with_the_price_rule(): void
    {
        // The phone draws its lock from this flag, so it has to match what the
        // server will actually fund.
        $models = collect(app(Catalog::class)->models('free'))->keyBy('id');
        $this->assertTrue($models['qwen/qwen3.8-flash']['trial']);
        $this->assertTrue($models['anthropic/claude-haiku-4.5']['trial']);
        $this->assertFalse($models['openai/gpt-5.5']['trial'],
            'Nothing is named in `free_extra`, so $30/M out is published locked like any other');
        $this->assertFalse($models['anthropic/claude-opus-5']['trial']);
    }

    public function test_raising_the_ceiling_includes_more_and_nothing_else_changes(): void
    {
        config(['vibes.free_tier' => ['input_per_million' => 5.00, 'output_per_million' => 25.00]]);
        $catalog = app(Catalog::class);
        $this->assertTrue($catalog->includedFree('anthropic/claude-opus-5'), 'The ceiling is the only thing deciding');
        $this->assertFalse($catalog->includedFree('someone/uncurated-model'), 'Curation is a separate gate');
    }

    public function test_a_free_account_cannot_spend_trial_credit_on_a_locked_model(): void
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'free-tier-session'), 'device_name' => 'iPhone']);
        $this->withToken('free-tier-session');
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) \Illuminate\Support\Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Test'])->assertOk();
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Hello',
            'model' => 'anthropic/claude-opus-5'])->assertOk()->json();

        // Priced, but the trial grant cannot fund it, so submitting is refused.
        $this->postJson('/api/vibes/turns', ['id' => (string) \Illuminate\Support\Str::uuid(), 'quote' => $quote['quote']])
            ->assertStatus(402);
        $this->assertSame((int) config('vibes.trial_credits'),
            (int) $this->getJson('/api/vibes/wallet')->json('wallet.available'));
        $this->assertSame(0, DB::table('vibes_turns')->count());
    }
}
