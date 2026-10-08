<?php
namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use App\Services\Membership\Enrollment;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class VibesDirectSendTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    private array $message;
    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'fixture-only', 'membership.free_enabled' => false,
            'vibes.max_output_tokens' => 4096, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0); app(Enrollment::class)->migrate($this->user, 0);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        DB::table('vibes_grants')->insert(['user_id' => $this->user->id, 'reference' => 'qa:direct', 'kind' => 'topup',
            'amount' => 1000, 'remaining' => 1000, 'created_at' => now(), 'updated_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'direct-test'), 'device_name' => 'test']);
        $this->withToken('direct-test'); Queue::fake();
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Direct'])->assertOk();
        $this->message = ['chatId' => $chat, 'text' => 'Hello', 'model' => 'qwen/qwen3.8-flash'];
    }
    public function test_one_step_admission_caps_small_balance_and_retains_partial_reply(): void
    {
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.directSend', true);
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'message' => $this->message])->assertStatus(202);
        $this->assertSame(1000, (int) DB::table('vibes_turns')->where('id', $id)->value('reserved'));
        Http::fake(['*' => Http::response(['id' => 'qa-generation', 'usage' => ['cost' => 0.0008],
            'choices' => [['message' => ['content' => 'A useful partial answer.'], 'finish_reason' => 'length']]])]);
        app()->call([new RunVibesTurn($id), 'handle']);
        Http::assertSent(fn ($r) => $r['max_tokens'] < 4096 && !isset($r['vibyraBalanceLimited']));
        $this->getJson('/api/vibes/turns/'.$id)->assertJsonPath('turn.response', 'A useful partial answer.')
            ->assertJsonPath('turn.finishReason', 'usage_limit')->assertJsonPath('turn.charged', 0.08);
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 0.02)->assertJsonPath('wallet.held', 0);
    }
    public function test_same_identity_returns_receipt_without_another_hold_or_repricing(): void
    {
        $id = (string) Str::uuid();
        $body = ['id' => $id, 'message' => $this->message];
        $this->postJson('/api/vibes/turns', $body)->assertStatus(202);
        $this->postJson('/api/vibes/turns', $body)->assertStatus(202);
        $this->assertDatabaseCount('vibes_turns', 1);
        $this->assertSame(1, DB::table('vibes_ledger')->where('reference', 'hold:'.$id)->count());
        $body['message']['text'] = 'Changed';
        $this->postJson('/api/vibes/turns', $body)->assertStatus(409);
    }
    public function test_zero_balance_and_foreign_chat_never_dispatch(): void
    {
        DB::table('vibes_grants')->where('user_id', $this->user->id)->update(['remaining' => 0]);
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'message' => $this->message])->assertStatus(402);
        $this->message['chatId'] = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'message' => $this->message])->assertStatus(404);
        $this->assertDatabaseCount('vibes_turns', 0); Queue::assertNothingPushed(); Http::assertNothingSent();
    }
}
