<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use App\Services\Membership\{Allowances, Enrollment};
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Usage history names what tokens were spent on: the model, the Cloud time, the assistant. */
class UsageActivityTest extends TestCase
{
    use RefreshDatabase;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.free_enabled' => true, 'membership.free_accounts' => 2, 'membership.free_tokens' => 10,
            'vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0);
        app(Enrollment::class)->migrate($this->user, 0);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'usage-test'), 'device_name' => 'test']);
        $this->withToken('usage-test');
        Queue::fake();
    }

    private function turn(string $model = 'anthropic/claude-sonnet-4.5'): object
    {
        app(Allowances::class)->refresh($this->user->id);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $this->user->id, 'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        $q = ['unitScale' => 10000, 'chatId' => $chat, 'model' => $model, 'text' => 'Hi', 'request' => ['model' => $model, 'messages' => [['role' => 'user', 'content' => 'Hi']],
                'max_tokens' => 512, 'provider' => ['max_price' => ['prompt' => 1, 'completion' => 1]]],
            'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => true, 'max' => 10000];
        return app(Turns::class)->submit($this->user->id, (string) Str::uuid(), $q);
    }

    private function usage(): array
    {
        return $this->getJson('/api/billing/activity?view=usage')->assertOk()->json('items');
    }

    public function test_a_reply_is_one_entry_with_its_model_tokens_and_real_cost(): void
    {
        $t = $this->turn();
        Http::fake(['*' => Http::response(['id' => 'gen-1', 'usage' => ['cost' => 0.0123, 'prompt_tokens' => 1240, 'completion_tokens' => 320],
            'choices' => [['message' => ['content' => 'Hello there.']]]])]);
        app()->call([new RunVibesTurn($t->id), 'handle']);
        $turn = DB::table('vibes_turns')->where('id', $t->id)->first();
        $this->assertSame([1240, 320], [(int) $turn->input_tokens, (int) $turn->output_tokens]);

        $items = collect($this->usage())->where('kind', 'ai')->values();
        $this->assertCount(1, $items, 'the hold and its settlement are one entry');
        $this->assertSame((string) -$turn->charged, $items[0]['deltaUnits']);
        $this->assertSame('anthropic/claude-sonnet-4.5', $items[0]['detail']['model']);
        $this->assertSame('claude-sonnet-4.5', $items[0]['detail']['modelName'], 'falls back to the id when the catalogue is cold');
        $this->assertSame([1240, 320, 'done'], [$items[0]['detail']['inputTokens'], $items[0]['detail']['outputTokens'], $items[0]['detail']['status']]);
        $this->assertFalse(collect($this->usage())->contains('kind', 'settlement'));
    }

    public function test_a_running_reply_shows_what_is_held_for_it(): void
    {
        $t = $this->turn();
        $item = collect($this->usage())->firstWhere('kind', 'ai');
        $this->assertSame('running', $item['detail']['status']);
        $this->assertSame((string) -$t->reserved, $item['deltaUnits']);
        $this->assertNull($item['detail']['inputTokens']);
    }

    public function test_the_raw_ledger_is_unchanged_but_carries_detail(): void
    {
        $t = $this->turn();
        app(Turns::class)->settle($t->id, 123, 'Done');
        $items = collect($this->getJson('/api/billing/activity')->assertOk()->json('items'));
        $this->assertTrue($items->contains('kind', 'hold'));
        $this->assertTrue($items->contains('kind', 'settlement'));
        $this->assertSame('ai', $items->firstWhere('kind', 'hold')['detail']['source']);
        $this->assertSame('trial', $items->firstWhere('kind', 'grant')['detail']['grantKind']);
    }

    public function test_cloud_time_and_assistant_requests_say_what_they_were(): void
    {
        $workspace = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $workspace, 'user_id' => $this->user->id, 'name' => 'My computer',
            'project_id' => 'p1', 'app_name' => 'vibyra-test-1', 'kind' => 'computer', 'created_at' => now(), 'updated_at' => now()]);
        $reservation = (string) Str::uuid();
        DB::table('cloud_reservations')->insert(['id' => $reservation, 'user_id' => $this->user->id, 'workspace_id' => $workspace,
            'generation' => 1, 'reserved' => 50000, 'charged' => 30000, 'units_per_hour' => 40000, 'billed_seconds' => 2700,
            'token_seconds' => 2700, 'allocations' => '[]', 'settled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        app(Wallet::class)->record($this->user->id, 'cloud-hold:'.$reservation, 'cloud_hold', -50000);
        app(Wallet::class)->record($this->user->id, 'cloud-settle:'.$reservation, 'cloud_settlement', 20000);
        $request = (string) Str::uuid();
        DB::table('assistant_requests')->insert(['id' => $request, 'user_id' => $this->user->id, 'request_id' => (string) Str::uuid(),
            'kind' => 'speech', 'state' => 'settled', 'reserved_micro_usd' => 10, 'charged_micro_usd' => 5,
            'reserved_units' => 20000, 'charged_units' => 10000, 'unit_scale' => 10000, 'allocations' => '[]', 'buckets' => '[]', 'created_at' => now()]);
        app(Wallet::class)->record($this->user->id, 'assistant-hold:'.$request, 'assistant_hold', -20000);
        app(Wallet::class)->record($this->user->id, 'cloud-budget:x', 'cloud_budget', 0);

        $items = collect($this->usage());
        $cloud = $items->firstWhere('kind', 'cloud');
        $this->assertSame('-30000', $cloud['deltaUnits']);
        $this->assertSame(['computer', 'My computer', 2700, 2700, 'done'], [$cloud['detail']['workspaceKind'], $cloud['detail']['name'],
            $cloud['detail']['seconds'], $cloud['detail']['tokenSeconds'], $cloud['detail']['status']]);
        $assistant = $items->firstWhere('kind', 'assistant');
        $this->assertSame(['-10000', 'speech'], [$assistant['deltaUnits'], $assistant['detail']['service']]);
        $this->assertFalse($items->contains('kind', 'cloud_budget'), 'zero-unit bookkeeping is left out');
        $this->assertFalse($items->contains('kind', 'cloud_settlement'));
    }

    public function test_usage_view_pages_and_is_only_the_accounts_own(): void
    {
        foreach (range(1, 3) as $i) app(Turns::class)->settle($this->turn()->id, 100, 'Done');
        $other = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($other, 0);
        app(Wallet::class)->record($other->id, 'hold:not-yours', 'hold', -5);
        $items = collect($this->usage());
        $this->assertFalse($items->contains('id', (string) DB::table('vibes_ledger')->where('reference', 'hold:not-yours')->value('id')));
        $this->getJson('/api/billing/activity?view=everything')->assertStatus(422);
        $last = $items->last()['id'];
        $this->getJson('/api/billing/activity?view=usage&before='.$last)->assertOk();
    }
}
