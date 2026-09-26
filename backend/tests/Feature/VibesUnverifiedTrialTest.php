<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A signed-up account that has not yet opened its verification mail gets the
 * same free trial a guest does, bounded by the same trial rules, and is still
 * refused anything past the trial until the address is proved.
 */
class VibesUnverifiedTrialTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => null]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'unverified-session'), 'device_name' => 'iPhone']);
        $this->withToken('unverified-session');
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
    }

    private function chat(): string
    {
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Build a timer'])->assertOk();
        return $id;
    }

    private function quote(string $chat): array
    {
        return $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Build a timer', 'model' => 'auto'])
            ->assertOk()->json();
    }

    public function test_wallet_unlocks_chat_and_reports_the_address_as_unverified(): void
    {
        $this->getJson('/api/vibes/wallet')->assertOk()
            ->assertJsonPath('wallet.chatEnabled', true)
            ->assertJsonPath('wallet.verified', false)
            ->assertJsonPath('wallet.guest', false)
            ->assertJsonPath('wallet.available', (int) config('vibes.trial_credits'));
    }

    public function test_unverified_account_can_quote_and_start_a_turn_on_its_trial(): void
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $q = $this->quote($this->chat());
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote']])->assertStatus(202);
        $this->assertDatabaseCount('vibes_turns', 1);
        $this->assertGreaterThan(0, (int) $this->getJson('/api/vibes/wallet')->json('wallet.held'));
    }

    public function test_trial_limits_still_bound_an_unverified_account(): void
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        // Each trial conversation gets one completed reply, so the account is at
        // the trial-chat limit with the grant not yet spent when the next chat opens.
        Http::fake(['*' => Http::response(['id' => 'generation-1', 'usage' => ['cost' => 0.0001],
            'choices' => [['message' => ['content' => 'Here is a timer.']]]])]);
        foreach (range(1, (int) config('vibes.trial_chats')) as $n) {
            $q = $this->quote($this->chat()); $id = (string) Str::uuid();
            $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
            app()->call([new RunVibesTurn($id), 'handle']);
            $this->getJson('/api/vibes/turns/'.$id)->assertJsonPath('turn.status', 'completed');
        }
        // One conversation past the trial's allowance is refused by the trial, not by verification.
        $q = $this->quote($this->chat());
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $q['quote']])->assertStatus(402);
    }

    public function test_purchased_vibes_stay_locked_until_the_email_is_verified(): void
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = $this->chat();
        DB::table('vibes_grants')->insert(['user_id' => $this->user->id, 'reference' => 'topup:test', 'kind' => 'topup',
            'amount' => 500, 'remaining' => 500, 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Hi', 'model' => 'auto'])
            ->assertStatus(403)->assertJsonPath('message', 'Verify your email to use your purchased Vibes.');
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => 'x'])->assertStatus(403);
        $this->assertDatabaseCount('vibes_turns', 0);

        $this->user->forceFill(['email_verified_at' => now()])->save();
        $this->quote($chat);
    }
}
