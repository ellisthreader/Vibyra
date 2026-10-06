<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Billing\OpenRouterPricingNormalizer;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Models OpenRouter lists without effort levels get the reviewed ones from
 * `config/openrouter_reasoning.php`: offered in the token picker, accepted at launch, and
 * sent to OpenRouter in the shape each model understands on every turn.
 */
class OpenRouterReasoningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Levels are under test here, not which models a terminal can reach.
        config(['vibes.enabled' => true, 'vibes.funded_terminals_enabled' => true, 'vibes.terminal_unavailable' => [],
            'services.openrouter.key' => 'test', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'reasoning-test'), 'device_name' => 'iPhone']);
        $this->withToken('reasoning-test');
        // A few hundred launches and turns in one test; request throttles are covered elsewhere.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['plan' => 'pro', 'paid_until' => now()->addMonth(), 'consented_at' => now()]);
        app(Wallet::class)->grant($user->id, 'reasoning-grant', 'topup', 100000);
        $model = fn (array $reasoning) => ['name' => 'Model', 'pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000002'],
            'supported_parameters' => ['reasoning', 'tools'], 'output_modalities' => ['text'], 'input_modalities' => ['text'], 'reasoning' => $reasoning];
        // Every reviewed model, listed the way OpenRouter lists them: thinking, but no levels.
        $models = collect(config('openrouter_reasoning.models'))->map(fn () => $model(['mandatory' => false]))->all();
        // OpenRouter publishing its own list for a reviewed model always wins.
        $models['x-ai/grok-4.20'] = $model(['mandatory' => false, 'supported_efforts' => ['low', 'high'], 'default_effort' => 'low']);
        $models['vendor/always-thinks'] = $model(['mandatory' => true]);
        Cache::put(config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => $models]);
        Queue::fake();
    }

    public function test_the_review_is_well_formed(): void
    {
        $order = OpenRouterPricingNormalizer::EFFORTS;
        foreach (config('openrouter_reasoning.models') as $id => $entry) {
            $this->assertNotEmpty($entry['efforts'], $id);
            $this->assertSame(array_values(array_intersect($order, $entry['efforts'])), $entry['efforts'], "$id lists real levels, cheapest first");
            $this->assertTrue($entry['default'] === null || in_array($entry['default'], $entry['efforts'], true), "$id default is offered");
            if ($entry['toggle'] ?? false) $this->assertSame(['none', 'high'], $entry['efforts'], "$id is an on/off switch");
        }
    }

    public function test_the_picker_offers_reviewed_levels_without_overriding_openrouter(): void
    {
        $rows = [];
        for ($page = 1; $page !== null; $page = $list['next']) {
            $list = $this->getJson('/api/vibes/terminal-models?page='.$page)->assertOk()->json();
            foreach ($list['models'] as $row) $rows[$row['id']] = $row;
        }
        foreach (config('openrouter_reasoning.models') as $id => $entry) {
            if ($id === 'x-ai/grok-4.20') continue;
            // An on/off switch is not a level to choose, so Vibyra tokens leaves those models out.
            if ($entry['toggle'] ?? false) { $this->assertArrayNotHasKey($id, $rows, $id); continue; }
            $this->assertSame($entry['efforts'], $rows[$id]['efforts'], $id);
            $this->assertSame($entry['default'], $rows[$id]['defaultEffort'], $id);
        }
        $this->assertSame(['low', 'high'], $rows['x-ai/grok-4.20']['efforts']);
        $this->assertArrayNotHasKey('vendor/always-thinks', $rows, 'a fixed thinker has no level to choose, so it is not offered');
    }

    public function test_every_offered_level_launches_and_reaches_openrouter_in_its_shape(): void
    {
        foreach (config('openrouter_reasoning.models') as $id => $entry) {
            if ($id === 'x-ai/grok-4.20') continue;
            if ($entry['toggle'] ?? false) {
                $this->postJson('/api/vibes/terminals', $this->launch($id, 'high'))->assertStatus(422);
                continue;
            }
            foreach ($entry['efforts'] as $effort) {
                $launch = $this->launch($id, $effort);
                $this->postJson('/api/vibes/terminals', $launch)->assertOk()->assertJsonPath('session.terminal_effort', $effort);
                $expected = ($entry['toggle'] ?? false) && $effort !== 'none' ? ['enabled' => true] : ['effort' => $effort];
                $this->assertSame($expected, $this->sentReasoning($launch), "$id at $effort");
            }
            $unlisted = collect(OpenRouterPricingNormalizer::EFFORTS)->diff($entry['efforts'])->first();
            if ($unlisted) $this->postJson('/api/vibes/terminals', $this->launch($id, $unlisted))->assertStatus(422);
        }
        // Phone chats still offer on/off models: "On" is sent as enabled, never as an effort.
        $this->assertSame(['enabled' => true], \App\Services\Billing\OpenRouterReasoning::request(['toggle' => true], 'high'));
        $this->assertSame(['effort' => 'none'], \App\Services\Billing\OpenRouterReasoning::request(['toggle' => true], 'none'));
        // The level OpenRouter publishes is sent exactly as chosen.
        $launch = $this->launch('x-ai/grok-4.20', 'high');
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $this->assertSame(['effort' => 'high'], $this->sentReasoning($launch));
    }

    private function launch(string $model, string $effort): array
    {
        return ['id' => (string) Str::uuid(), 'title' => 'Terminal', 'source' => 'vibyra', 'model' => $model, 'effort' => $effort,
            'hostId' => 'host', 'projectId' => 'project', 'binding' => (string) Str::uuid(), 'tools' => true, 'budget' => 10];
    }

    /** The `reasoning` body of the request a first turn in this terminal sends to OpenRouter. */
    private function sentReasoning(array $launch): ?array
    {
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']])->assertOk()->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);

        $request = json_decode(DB::table('vibes_turns')->where('id', $id)->value('request'), true);
        // Settled so the next terminal's turn is not held back by the concurrent-reply limit.
        DB::table('vibes_turns')->where('id', $id)->update(['settled_at' => now()]);

        return $request['reasoning'] ?? null;
    }
}
