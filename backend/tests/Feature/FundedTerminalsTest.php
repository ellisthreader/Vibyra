<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class FundedTerminalsTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'vibes.funded_terminals_enabled' => true,
            'services.openrouter.key' => 'test', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'funded-test'), 'device_name' => 'iPhone']);
        $this->withToken('funded-test');
        app(Wallet::class)->ensure($this->user);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['plan' => 'pro', 'paid_until' => now()->addMonth(), 'consented_at' => now()]);
        app(Wallet::class)->grant($this->user->id, 'funded-grant', 'topup', 100);
        $models = [];
        for ($i = 0; $i < 425; $i++) $models['inception/model-'.$i] = ['name' => 'Model '.$i, 'pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000002'],
            'supported_parameters' => $i === 0 ? [] : ['tools'], 'output_modalities' => $i === 424 ? ['text', 'image'] : ['text'], 'input_modalities' => ['text'],
            // Vibyra tokens offers only models whose effort can be chosen.
            'reasoning' => ['mandatory' => false, 'supported_efforts' => ['low', 'high'], 'default_effort' => 'low']];
        $models['vendor/image'] = ['pricing' => ['prompt' => '0', 'completion' => '0'], 'output_modalities' => ['image']];
        Cache::put(config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => $models]);
        Queue::fake();
    }
    private function launch(string $model = 'inception/model-0'): array
    {
        return ['id' => (string) Str::uuid(), 'title' => 'My terminal', 'source' => 'vibyra', 'model' => $model,
            'hostId' => 'host', 'projectId' => 'project', 'binding' => (string) Str::uuid(), 'tools' => $model !== 'inception/model-0', 'budget' => 10];
    }
    public function test_full_catalogue_is_paginated_without_curated_vendor_or_400_row_filters(): void
    {
        $first = $this->getJson('/api/vibes/terminal-models')->assertOk()->assertJsonCount(100, 'models')->json();
        $last = $this->getJson('/api/vibes/terminal-models?page=5&revision='.$first['revision'])->assertOk()->assertJsonCount(25, 'models')->json();
        $this->assertNull($last['next']);
        $this->getJson('/api/vibes/terminal-models?page=2&revision='.str_repeat('a', 64))->assertStatus(409);
    }
    public function test_only_models_with_effort_levels_to_choose_are_offered(): void
    {
        $key = config('billing.openrouter_pricing.cache_key');
        $snapshot = Cache::get($key);
        $snapshot['models']['inception/model-2']['reasoning'] = null;                                       // cannot think
        $snapshot['models']['inception/model-3']['reasoning'] = ['mandatory' => true];                      // always thinks, no levels
        $snapshot['models']['inception/model-4']['reasoning'] = ['supported_efforts' => ['none', 'high']];  // only on or off
        $snapshot['models']['inception/model-5']['reasoning'] = ['supported_efforts' => ['high']];          // one fixed level
        Cache::put($key, $snapshot);
        $ids = [];
        for ($page = 1; $page !== null; $page = $list['next']) {
            $list = $this->getJson('/api/vibes/terminal-models?page='.$page)->assertOk()->json();
            $ids = [...$ids, ...array_column($list['models'], 'id')];
        }
        $this->assertContains('inception/model-6', $ids);
        foreach ([2, 3, 4, 5] as $i) {
            $this->assertNotContains('inception/model-'.$i, $ids);
            $this->postJson('/api/vibes/terminals', $this->launch('inception/model-'.$i))->assertStatus(422)
                ->assertJsonPath('message', 'Choose a model with effort levels.');
        }
    }
    public function test_a_terminal_keeps_working_when_its_model_stops_being_offered(): void
    {
        $launch = $this->launch('inception/model-4');
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $key = config('billing.openrouter_pricing.cache_key');
        $snapshot = Cache::get($key);
        $snapshot['models']['inception/model-4']['reasoning'] = ['supported_efforts' => ['none', 'high']];
        Cache::put($key, $snapshot);
        // No longer offered for new terminals, but the open one still answers.
        $this->postJson('/api/vibes/terminals', $this->launch('inception/model-4'))->assertStatus(422);
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']])->assertOk();
    }
    public function test_the_curated_menu_limits_new_terminals_but_not_open_ones(): void
    {
        $open = $this->launch('inception/model-9');
        $this->postJson('/api/vibes/terminals', $open)->assertOk();
        config(['vibes.terminal_models' => ['inception/model-8']]);
        $ids = [];
        for ($page = 1; $page !== null; $page = $list['next']) {
            $list = $this->getJson('/api/vibes/terminal-models?page='.$page)->assertOk()->json();
            $ids = [...$ids, ...array_column($list['models'], 'id')];
        }
        $this->assertSame(['inception/model-8'], $ids);
        $this->postJson('/api/vibes/terminals', $this->launch('inception/model-7'))->assertStatus(422)
            ->assertJsonPath('message', 'Choose a model from the list.');
        $this->postJson('/api/vibes/terminals', $this->launch('inception/model-8'))->assertOk();
        $picked = app(\App\Services\Vibes\TerminalCatalog::class)->candidates(['inception/model-7', 'inception/model-8']);
        $this->assertSame(['inception/model-8'], array_column($picked, 'id'), 'Auto stays inside the menu');
        // A terminal opened before the menu changed keeps answering.
        $this->postJson('/api/vibes/quote', ['chatId' => $open['id'], 'text' => 'Hello', 'model' => $open['model']])->assertOk();
    }
    public function test_models_no_terminal_can_reach_are_never_offered(): void
    {
        config(['vibes.terminal_unavailable' => ['inception/model-7']]);
        $ids = [];
        for ($page = 1; $page !== null; $page = $list['next']) {
            $list = $this->getJson('/api/vibes/terminal-models?page='.$page)->assertOk()->json();
            $ids = [...$ids, ...array_column($list['models'], 'id')];
        }
        $this->assertContains('inception/model-8', $ids);
        $this->assertNotContains('inception/model-7', $ids);
        $this->postJson('/api/vibes/terminals', $this->launch('inception/model-7'))->assertStatus(422);
        $picked = app(\App\Services\Vibes\TerminalCatalog::class)->candidates(['inception/model-7', 'inception/model-8']);
        $this->assertSame(['inception/model-8'], array_column($picked, 'id'), 'Auto never picks one either');
    }
    public function test_launch_is_idempotent_fixed_to_model_and_project_and_does_not_charge(): void
    {
        $launch = $this->launch();
        $ledger = DB::table('vibes_ledger')->count();
        $this->postJson('/api/vibes/terminals', $launch)->assertOk()->assertJsonPath('session.terminal_model', $launch['model']);
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $this->assertEquals(1, DB::table('vibes_chats')->count());
        $this->assertEquals($ledger, DB::table('vibes_ledger')->count());
        $this->postJson('/api/vibes/terminals', [...$launch, 'model' => 'inception/model-1'])->assertStatus(409);
        $this->postJson('/api/vibes/chats/'.$launch['id'].'/project/unlink')->assertStatus(409);
        $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => 'auto'])->assertStatus(409);
    }
    public function test_chat_only_and_tool_models_use_the_same_wallet_with_exactly_once_settlement(): void
    {
        foreach ([1, 10000] as $scale) {
            DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['billing_version' => $scale === 1 ? 1 : 2]);
            app(Wallet::class)->grant($this->user->id, 'scale-'.$scale, 'topup', 100 * $scale);
            $launch = $this->launch($scale === 1 ? 'inception/model-0' : 'inception/model-1');
            $this->postJson('/api/vibes/terminals', $launch)->assertOk();
            $quote = $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']])->assertOk()->json();
            $id = (string) Str::uuid();
            $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
            $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
            $turn = DB::table('vibes_turns')->where('id', $id)->first();
            $request = json_decode($turn->request, true);
            $this->assertSame($scale !== 1, isset($request['tools']));
            $this->assertSame($launch['model'], $request['model']);
            $this->assertSame(['text'], $request['modalities']);
            app(Turns::class)->settle($id, 2000, 'Hello');
            app(Turns::class)->settle($id, 2000, 'Hello');
            $this->assertEquals(1, DB::table('vibes_ledger')->where('reference', 'settle:'.$id)->count());
            $this->getJson('/api/vibes/chats')->assertOk();
        }
    }
    public function test_expiry_close_and_budget_are_enforced_before_holds(): void
    {
        $launch = $this->launch('inception/model-1');
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $q = $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Read files', 'model' => $launch['model']])->assertOk()->json();
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['paid_until' => now()->subMinute()]);
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote']])->assertStatus(403);
        $this->getJson('/api/vibes/terminal-models')->assertStatus(403);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['paid_until' => now()->addMonth()]);
        DB::table('vibes_chats')->where('id', $launch['id'])->update(['terminal_budget_micro' => 0]);
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote']])->assertStatus(402);
        $this->postJson('/api/vibes/terminals/'.$launch['id'].'/close')->assertOk();
        $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']])->assertStatus(409);
        $this->assertEquals(0, DB::table('vibes_turns')->count());
    }

    public function test_funded_job_uses_actual_usage_and_cancel_releases_the_next_hold(): void
    {
        $launch = $this->launch();
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $body = ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']];
        $quote = $this->postJson('/api/vibes/quote', $body)->assertOk()->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        Http::fake(['*' => Http::response(['id' => 'funded-generation', 'usage' => ['cost' => 0.001],
            'choices' => [['message' => ['content' => 'Hello']]]])]);
        $job = new \App\Jobs\RunVibesTurn($id);
        app()->call([$job, 'handle']); app()->call([$job, 'handle']);
        Http::assertSentCount(1);
        $this->getJson('/api/vibes/turns/'.$id)->assertJsonPath('turn.status', 'completed')->assertJsonPath('turn.charged', 1);
        $quote = $this->postJson('/api/vibes/quote', $body)->assertOk()->json();
        $id = (string) Str::uuid();
        $balance = $this->getJson('/api/vibes/wallet')->json('wallet.available');
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        $this->postJson('/api/vibes/turns/'.$id.'/cancel')->assertOk();
        app()->call([new \App\Jobs\RunVibesTurn($id), 'handle']);
        Http::assertSentCount(1);
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', $balance)->assertJsonPath('wallet.held', 0);
    }

    public function test_effort_is_persisted_in_receipt_and_quote_and_router_is_never_a_terminal(): void
    {
        $key = config('billing.openrouter_pricing.cache_key');
        $snapshot = Cache::get($key);
        $snapshot['models']['inception/model-1']['reasoning'] = ['supported_efforts' => ['low', 'high'], 'default_effort' => 'low'];
        $snapshot['models']['typesafe/jev-router'] = $snapshot['models']['inception/model-1'];
        $snapshot['models']['~inception/model-latest'] = $snapshot['models']['inception/model-1'];
        Cache::put($key, $snapshot);
        $launch = [...$this->launch('inception/model-1'), 'effort' => 'high'];
        $this->postJson('/api/vibes/terminals', $launch)->assertOk()->assertJsonPath('session.terminal_effort', 'high');
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        $this->postJson('/api/vibes/terminals', [...$launch, 'effort' => 'low'])->assertStatus(409);
        $this->postJson('/api/vibes/terminals', [...$this->launch('inception/model-1'), 'effort' => 'max'])->assertStatus(422);
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model'], 'effort' => 'low'])->assertOk()->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        $request = json_decode(DB::table('vibes_turns')->where('id', $id)->value('request'), true);
        $this->assertSame('high', $request['reasoning']['effort']);
        $this->postJson('/api/vibes/terminals', $this->launch('typesafe/jev-router'))->assertStatus(422);
        $ids = [];
        for ($page = 1; $page !== null; $page = $list['next']) {
            $list = $this->getJson('/api/vibes/terminal-models?page='.$page)->assertOk()->json();
            $ids = [...$ids, ...array_column($list['models'], 'id')];
        }
        $this->assertContains('inception/model-1', $ids);
        $this->assertNotContains('typesafe/jev-router', $ids);
        $this->assertNotContains('~inception/model-latest', $ids);
    }

    public function test_unknown_models_stale_prices_and_other_accounts_are_refused(): void
    {
        $this->postJson('/api/vibes/terminals', $this->launch('vendor/image'))->assertStatus(422);
        $launch = $this->launch();
        $this->postJson('/api/vibes/terminals', $launch)->assertOk();
        DB::table('vibes_chats')->where('id', $launch['id'])->update(['user_id' => User::factory()->create()->id]);
        $this->postJson('/api/vibes/terminals', $launch)->assertStatus(409);
        $this->postJson('/api/vibes/quote', ['chatId' => $launch['id'], 'text' => 'Hello', 'model' => $launch['model']])->assertNotFound();
        Http::fake(['*' => Http::response([], 503)]);
        $this->travel(2)->days();
        $this->postJson('/api/vibes/terminals', $this->launch())->assertStatus(503);
    }
}
