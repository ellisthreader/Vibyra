<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class VibesApiTest extends TestCase
{
    use RefreshDatabase;
    private string $token = 'vibes-test-session';

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $u = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        $this->withToken($this->token);
        Cache::put('billing:openrouter-pricing:v1', ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
    }

    private function quote(): array
    {
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.available', 100);
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Build a timer'])->assertOk();
        return $this->postJson('/api/vibes/quote', ['chatId' => $id, 'text' => 'Build a timer', 'model' => 'auto'])
            ->assertOk()->json();
    }

    public function test_real_route_to_job_settlement_and_status(): void
    {
        $q = $this->quote(); $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        Http::fake(['*' => Http::response(['id' => 'generation-1', 'usage' => ['cost' => 0.001],
            'choices' => [['message' => ['content' => 'Here is a timer.']]]])]);
        $job = new RunVibesTurn($id); app()->call([$job, 'handle']); app()->call([$job, 'handle']);
        Http::assertSentCount(1);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'completed')->assertJsonPath('turn.charged', 1);
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 99)->assertJsonPath('wallet.held', 0);
    }

    public function test_unknown_usage_is_held_then_released_without_replay(): void
    {
        $q = $this->quote(); $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        Http::fake(['*' => Http::response([], 500)]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->getJson('/api/vibes/turns/'.$id)->assertJsonPath('turn.status', 'reconciling');
        $this->travel(16)->minutes();
        $this->artisan('vibyra:recover-vibes')->assertSuccessful();
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 100);
        $this->assertSame($q['maxCredits'] * 10000, (int) DB::table('vibes_spend_days')->sum('spent'));
        Http::assertSentCount(1);
    }

    public function test_cancelled_queue_never_calls_provider(): void
    {
        $q = $this->quote(); $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        $this->postJson('/api/vibes/turns/'.$id.'/cancel')->assertOk();
        Http::fake();
        app()->call([new RunVibesTurn($id), 'handle']);
        Http::assertNothingSent();
        $this->getJson('/api/vibes/turns/'.$id)->assertJsonPath('turn.status', 'cancelled');
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 100);
    }

    public function test_tampered_quote_wrong_account_and_unverified_identity_fail_closed(): void
    {
        $q = $this->quote();
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote'].'changed'])->assertStatus(422);
        $chat = DB::table('vibes_chats')->value('id');
        User::query()->update(['email_verified_at' => null]);
        $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Hi', 'model' => 'auto'])->assertStatus(403);
        $this->withToken('wrong')->getJson('/api/vibes/wallet')->assertStatus(401);
        $this->assertDatabaseCount('vibes_turns', 0);
    }
    public function test_rollback_stops_new_work_but_keeps_wallet_history_and_cancellation_available(): void
    {
        $q = $this->quote(); $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        config(['vibes.enabled' => false]);
        $this->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.chatEnabled', false);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk();
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote']])->assertStatus(503);
        $this->postJson('/api/vibes/turns/'.$id.'/cancel')->assertOk();
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 100);
    }
}
