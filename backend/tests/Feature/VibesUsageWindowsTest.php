<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\{UsageWindows, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Queue};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * The two rolling usage windows. What is being proven is that they bound the rate
 * an account spends at without ever reducing what it may spend in total, and that
 * the figures the wallet publishes are the same ones `Turns::submit` refuses on.
 */
class VibesUsageWindowsTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'vibes-window-session';

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
    }

    private function account(string $plan = 'pro'): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update([
            'consented_at' => now(), 'plan' => $plan,
            'paid_until' => $plan === 'free' ? null : now()->addMonth(),
        ]);
        app(Wallet::class)->grant($user->id, 'test-plan:'.$user->id, 'plan', 5000);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        return $user;
    }

    /** A settled turn of `$charged` Vibes, `$agoMinutes` back. */
    private function spend(User $user, int $charged, int $agoMinutes, ?int $reserved = null): string
    {
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id,
            'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        $id = (string) Str::uuid();
        DB::table('vibes_turns')->insert(['id' => $id, 'user_id' => $user->id, 'chat_id' => $chat,
            'digest' => str_repeat('a', 64), 'model' => 'qwen/qwen3.8-flash', 'status' => 'completed',
            'request' => '{}', 'allocations' => '[]', 'prompt' => 'Hi', 'reserved' => $reserved ?? $charged,
            'charged' => $charged, 'settled_at' => $reserved === null ? now()->subMinutes($agoMinutes) : null,
            'created_at' => now()->subMinutes($agoMinutes), 'updated_at' => now()->subMinutes($agoMinutes)]);
        return $id;
    }

    public function test_spend_ages_out_of_the_rolling_window_instead_of_resetting_on_a_clock(): void
    {
        $user = $this->account();
        $this->spend($user, 100, 60);
        $this->spend($user, 40, 6 * 60);
        $limits = app(UsageWindows::class)->payload($user->id, 'pro');
        // The 6-hour-old turn is outside the 5-hour session and inside the week.
        $this->assertSame(100, $limits['session']['used']);
        $this->assertSame(140, $limits['week']['used']);
        $this->assertSame(400, $limits['session']['limit']);
        $this->assertSame(1000, $limits['week']['limit']);
        $this->assertSame(5, $limits['session']['hours']);
        $this->assertSame(7, $limits['week']['days']);
    }

    public function test_a_reply_in_flight_holds_what_it_reserved_and_returns_the_rest_at_settle(): void
    {
        $user = $this->account();
        $held = $this->spend($user, 0, 5, reserved: 50);
        $this->assertSame(50, app(UsageWindows::class)->payload($user->id, 'pro')['session']['used']);
        // Settled for 3 of the 50 it reserved: the other 47 come back to the window
        // immediately, not at the end of it.
        DB::table('vibes_turns')->where('id', $held)->update(['charged' => 3, 'settled_at' => now()]);
        $this->assertSame(3, app(UsageWindows::class)->payload($user->id, 'pro')['session']['used']);
    }

    public function test_the_session_window_refuses_a_turn_that_would_cross_it_and_says_when(): void
    {
        $user = $this->account();
        // 60 minutes in, so 4 hours of the 5-hour window are left to wait out.
        $this->spend($user, 400, 60);
        try {
            app(UsageWindows::class)->guard($user->id, 'pro', 1);
            $this->fail('The session window should have refused this turn.');
        } catch (HttpException $e) {
            $this->assertSame(429, $e->getStatusCode());
            $this->assertStringContainsString('5-hour Vibes limit', $e->getMessage());
            $this->assertStringContainsString('4 hours', $e->getMessage());
        }
    }

    public function test_the_session_is_named_before_the_week_because_it_frees_up_first(): void
    {
        $user = $this->account();
        // Over both windows at once. The one worth waiting for is the one named.
        $this->spend($user, 400, 30);
        $this->spend($user, 600, 2 * 24 * 60);
        try {
            app(UsageWindows::class)->guard($user->id, 'pro', 1);
            $this->fail('Both windows are full; one of them should have refused.');
        } catch (HttpException $e) {
            $this->assertStringContainsString('5-hour', $e->getMessage());
            $this->assertStringNotContainsString('7-day', $e->getMessage());
        }
    }

    public function test_the_week_window_still_refuses_once_the_session_has_room(): void
    {
        $user = $this->account();
        $this->spend($user, 1000, 3 * 24 * 60);
        try {
            app(UsageWindows::class)->guard($user->id, 'pro', 1);
            $this->fail('The week window should have refused this turn.');
        } catch (HttpException $e) {
            $this->assertSame(429, $e->getStatusCode());
            $this->assertStringContainsString('7-day Vibes limit', $e->getMessage());
            $this->assertStringContainsString('4 days', $e->getMessage());
        }
    }

    public function test_a_bigger_plan_buys_a_bigger_window_and_a_lapsed_one_falls_back_to_free(): void
    {
        $user = $this->account('starter');
        $this->spend($user, 175, 30);
        // Starter is full at 175 for the week; Builder would still have room.
        $this->assertSame(175, app(UsageWindows::class)->payload($user->id, 'starter')['week']['limit']);
        $this->assertSame(500, app(UsageWindows::class)->payload($user->id, 'builder')['week']['limit']);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['paid_until' => now()->subDay()]);
        $limits = app(Wallet::class)->payload($user->id)['limits'];
        // An expired paid period is entitled as Free, and the Free window is what a
        // lapsed subscriber's paid, never-reclaimed balance now drains at.
        $this->assertSame(150, $limits['week']['limit']);
        $this->assertSame(60, $limits['session']['limit']);
    }

    public function test_the_window_bounds_the_rate_a_send_may_spend_at_not_the_balance(): void
    {
        $user = $this->account();
        $this->withToken($this->token);
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Build a timer'])->assertOk();
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Build a timer', 'model' => 'auto'])
            ->assertOk()->json();
        // The account holds 5,000 Vibes and can afford this many times over. It is
        // the window that refuses, and the balance is untouched by the refusal.
        $this->spend($user, 1000, 10);
        $before = app(Wallet::class)->available($user->id);
        $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $quote['quote']])
            ->assertStatus(429)->assertJsonPath('message', fn ($said) => str_contains((string) $said, 'Vibes limit'));
        $this->assertSame($before, app(Wallet::class)->available($user->id));
        $this->assertSame(0, DB::table('vibes_turns')->where('status', 'queued')->count());
    }
}
