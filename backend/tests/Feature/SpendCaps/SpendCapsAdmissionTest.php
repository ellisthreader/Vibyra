<?php
namespace Tests\Feature\SpendCaps;

use App\Services\Spend\Refusal;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SpendCapsAdmissionTest extends SpendCapsTestCase
{
    public function test_with_the_flag_off_nothing_is_counted_or_refused(): void
    {
        config(['spend_caps.enabled' => false]);
        $this->caps(day: 1);
        for ($i = 0; $i < 3; $i++) $this->settle($this->submit(), 100_000);
        $this->assertSame(0, DB::table('wallet_spend_periods')->count());
    }

    public function test_a_reached_daily_cap_refuses_with_429_spend_cap_and_reserves_nothing(): void
    {
        $this->caps(day: 25);
        for ($i = 0; $i < 3; $i++) $this->settle($this->submit(), 100_000);
        $before = [$this->balance(), DB::table('vibes_turns')->count(), DB::table('vibes_ledger')->count()];
        try { $this->submit(); $this->fail('expected a refusal'); }
        catch (Refusal $e) {
            $this->assertSame(429, $e->getStatusCode());
            $this->assertSame(['cap' => 'day', 'limit' => 25, 'used' => 30, 'unit' => 'tokens', 'raisable' => true],
                array_diff_key($e->detail, ['resetsAt' => 1]));
            $this->assertNotNull($e->detail['resetsAt']);
            $this->assertStringContainsString('daily spending limit of 25 tokens', $e->getMessage());
            $this->assertStringContainsString('00:00 tomorrow', $e->getMessage());
        }
        $this->assertSame($before, [$this->balance(), DB::table('vibes_turns')->count(), DB::table('vibes_ledger')->count()]);
    }

    public function test_over_http_the_refusal_is_429_with_a_code_and_never_the_402_upsell(): void
    {
        $this->caps(day: 1);
        $this->settle($this->submit(), 100_000);
        $quote = \Illuminate\Support\Facades\Crypt::encryptString(json_encode($this->quote(100_000, $this->chat())));
        $this->postJson('/api/vibes/turns', ['id' => (string) \Illuminate\Support\Str::uuid(), 'quote' => $quote])
            ->assertStatus(429)->assertJsonPath('code', 'spend_cap')->assertJsonPath('cap', 'day')
            ->assertJsonPath('limit', 1)->assertJsonPath('used', 10)->assertJsonStructure(['resetsAt', 'error', 'message']);
    }

    public function test_the_monthly_cap_refuses_and_names_its_reset(): void
    {
        $this->caps(month: 10);
        $this->settle($this->submit(), 100_000);
        $e = $this->refusal();
        $this->assertSame('month', $e->detail['cap']);
        $this->assertStringContainsString('monthly spending limit of 10 tokens', $e->getMessage());
        $this->assertStringContainsString(now()->addMonthNoOverflow()->startOfMonth()->format('j F'), $e->getMessage());
    }

    public function test_overshoot_is_bounded_by_one_in_flight_reservation(): void
    {
        $this->caps(day: 25);
        $this->settle($this->submit(100_000), 100_000);
        $this->settle($this->submit(100_000), 100_000);
        $this->assertSame(20, $this->used() / 10000);
        // Under the cap (20 of 25), so the next one is admitted even though its reservation crosses it.
        $turn = $this->submit(100_000);
        $this->assertSame(300_000, $this->used());
        $this->assertSame(50_000, $this->used() - 250_000, 'over by at most the one reservation');
        try { app(\App\Services\Spend\SpendCaps::class)->guard($this->user->id); $this->fail('expected a refusal'); }
        catch (Refusal $e) { $this->assertSame('day', $e->detail['cap']); }
        $this->settle($turn, 100_000);
    }

    public function test_settlement_refunds_the_unused_part_and_is_idempotent(): void
    {
        $this->caps(day: 25);
        $turn = $this->submit(100_000);
        $this->assertSame([100_000, 0], [(int) $this->row()->held, (int) $this->row()->spent]);
        $this->settle($turn, 20_000);
        $this->assertSame([0, 20_000], [(int) $this->row()->held, (int) $this->row()->spent]);
        $balance = $this->balance();
        $this->settle($turn, 90_000);
        app(\App\Services\Vibes\Turns::class)->settle($turn->id, 20_000, 'ok');
        $this->assertSame([0, 20_000], [(int) $this->row()->held, (int) $this->row()->spent]);
        $this->assertSame($balance, $this->balance());
        $this->assertSame(20_000, $this->used('month'));
    }

    public function test_a_settlement_after_midnight_adjusts_the_period_the_hold_was_made_in(): void
    {
        $this->caps(day: 25, tz: 'America/Los_Angeles');
        Carbon::setTestNow('2026-10-03 06:30:00'); // 23:30 on 2 October in Los Angeles
        $turn = $this->submit(100_000);
        $first = $this->row();
        Carbon::setTestNow('2026-10-03 07:30:00'); // 00:30 on 3 October there: a new day, same UTC date
        $this->assertSame(0, DB::table('wallet_spend_periods')->where('kind', 'day')->where('starts_at', '>', $first->starts_at)->count());
        $this->settle($turn, 30_000);
        $old = DB::table('wallet_spend_periods')->where('id', $first->id)->first();
        $this->assertSame([0, 30_000], [(int) $old->held, (int) $old->spent]);
        $this->settle($this->submit(), 10_000);
        $new = $this->row();
        $this->assertNotSame($first->id, $new->id);
        $this->assertSame(10_000, $this->used(), 'a fresh day starts at zero');
        $this->assertSame('2026-10-03 07:00:00', $new->starts_at);
        Carbon::setTestNow();
    }

    public function test_a_per_task_limit_lowers_the_quote_ceiling_to_the_smaller_value(): void
    {
        $caps = app(\App\Services\Spend\SpendCaps::class);
        $this->assertSame(50, $caps->limitQuote($this->user->id, 50));
        $this->caps(run: 10);
        $this->assertSame(10.0, (float) $caps->limitQuote($this->user->id, 50));
        $this->assertSame(4, $caps->limitQuote($this->user->id, 4), 'never raised above the existing ceiling');
    }

    private function refusal(): Refusal
    {
        try { $this->submit(); } catch (Refusal $e) { return $e; }
        $this->fail('expected a refusal');
    }

    public function test_a_legacy_vibes_wallet_is_counted_in_the_same_tokens(): void
    {
        $legacy = \App\Models\User::factory()->create(['email_verified_at' => now()]);
        config(['membership.enabled' => false, 'membership.free_enabled' => false]);
        app(\App\Services\Vibes\Wallet::class)->ensure($legacy);
        DB::table('vibes_wallets')->where('user_id', $legacy->id)->update(['consented_at' => now(), 'cap_day_units' => 80_000, 'cap_timezone' => 'UTC']);
        app(\App\Services\Vibes\Wallet::class)->grant($legacy->id, 'legacy-funds', 'topup', 100);
        $submit = function () use ($legacy) {
            $chat = (string) \Illuminate\Support\Str::uuid();
            DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $legacy->id, 'title' => 'Old', 'created_at' => now(), 'updated_at' => now()]);
            $q = ['unitScale' => 1, 'chatId' => $chat, 'model' => 'test', 'text' => 'Hi', 'request' => [],
                'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => false, 'max' => 5, 'userId' => $legacy->id];
            return app(\App\Services\Vibes\Turns::class)->submit($legacy->id, (string) \Illuminate\Support\Str::uuid(), $q);
        };
        $first = $submit();
        $this->assertSame(50_000, (int) DB::table('wallet_spend_periods')->where('user_id', $legacy->id)->where('kind', 'day')->value('held'), '5 Vibes is 5 tokens');
        app(\App\Services\Vibes\Turns::class)->settle($first->id, 50_000, 'ok');
        $second = $submit(); // 5 of 8 tokens used: still under the limit
        app(\App\Services\Vibes\Turns::class)->settle($second->id, 50_000, 'ok');
        $this->expectException(Refusal::class);
        $submit();
    }
}
