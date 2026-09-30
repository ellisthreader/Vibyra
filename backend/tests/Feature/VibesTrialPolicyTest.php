<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * What a free account is actually given, asserted over the shipped config rather
 * than over a fixture. Every other Vibes test pins the trial (see
 * `Support\PinnedVibesTrial`) because it is measuring mechanics; this one exists
 * so that retuning the trial fails exactly one test, and that test is this one.
 *
 * The policy it holds to: a free account gets a handful of Vibes, once, and a
 * Vibe is a fixed slice of real OpenRouter spend — so the most Vibyra can ever
 * fund for a free account is a knowable, tiny sum, and it is spent at whatever
 * the provider actually charged rather than at an estimate.
 */
class VibesTrialPolicyTest extends TestCase
{
    use RefreshDatabase;

    private function account(): User
    {
        $user = User::factory()->create(['plan' => 'free', 'credits_balance' => 50]);
        app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        return $user;
    }

    public function test_the_free_grant_is_a_handful_of_vibes_worth_a_few_pence(): void
    {
        $credits = (int) config('vibes.trial_credits');
        $microPerCredit = (int) config('vibes.micro_usd_per_credit');

        $this->assertGreaterThan(0, $credits, 'A free account must be able to send at least one message.');
        $this->assertLessThanOrEqual(10, $credits, 'The free grant is a taste of the product, not a usable amount of it.');
        $this->assertGreaterThanOrEqual(1, (int) config('vibes.trial_chats'));
        // One Vibe is one cent of provider spend, so the whole free tier has a
        // ceiling that can be read off the config without running anything.
        $this->assertSame(10000, $microPerCredit);
        $this->assertLessThanOrEqual(100000, $credits * $microPerCredit,
            'The lifetime cost of one free account must stay under $0.10 of OpenRouter spend.');
    }

    public function test_the_grant_is_given_once_and_bounds_what_a_free_account_can_spend(): void
    {
        $user = $this->account();
        $granted = (int) config('vibes.trial_credits');
        app(Wallet::class)->ensure($user);
        $this->assertSame($granted, app(Wallet::class)->payload($user->id)['available']);
        $this->assertDatabaseCount('vibes_grants', 1);

        // A turn priced above the whole grant cannot be reserved at all, which is
        // what keeps sponsored spend inside the grant rather than inside the quote.
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id, 'title' => 'Test',
            'created_at' => now(), 'updated_at' => now()]);
        try {
            app(Turns::class)->submit($user->id, (string) Str::uuid(), ['chatId' => $chat, 'text' => 'Hello',
                'model' => 'qwen/qwen3.8-flash', 'trial' => true, 'max' => $granted + 1, 'request' => [],
                'expires' => now()->addMinute()->timestamp, 'revision' => 0]);
            $this->fail('A turn dearer than the free grant was accepted.');
        } catch (HttpException $e) {
            $this->assertSame(402, $e->getStatusCode());
        }
        $this->assertSame($granted, app(Wallet::class)->payload($user->id)['available']);
    }

    public function test_a_turn_is_charged_at_the_provider_s_own_cost_not_the_estimate(): void
    {
        $user = $this->account();
        $chat = (string) Str::uuid(); $turn = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id, 'title' => 'Test',
            'created_at' => now(), 'updated_at' => now()]);
        $granted = (int) config('vibes.trial_credits');
        app(Turns::class)->submit($user->id, $turn, ['chatId' => $chat, 'text' => 'Hello',
            'model' => 'qwen/qwen3.8-flash', 'trial' => true, 'max' => $granted, 'request' => [],
            'expires' => now()->addMinute()->timestamp, 'revision' => 0]);
        $this->assertSame(0, app(Wallet::class)->payload($user->id)['available'], 'The whole quote is held while the reply runs.');

        // OpenRouter reported $0.004 of spend. That is under one Vibe, and a Vibe
        // is the unit, so it rounds up to one and the rest of the hold comes back.
        app(Turns::class)->settle($turn, 4000, 'Hello there.');
        $this->assertSame($granted - 1, app(Wallet::class)->payload($user->id)['available']);
        $this->assertSame(1, (int) DB::table('vibes_turns')->where('id', $turn)->value('charged'));
        $this->assertSame(4000, (int) DB::table('vibes_turns')->where('id', $turn)->value('actual_micro_usd'));
    }
}
