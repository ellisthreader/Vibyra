<?php
namespace Tests\Feature;

use App\Services\Assistant\Budget;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AssistantFundedCapacityTest extends TestCase
{
    use RefreshDatabase, AssistantFixture;

    private function reserveCost(int $cost): string
    {
        return app(Budget::class)->reserve($this->user->id, $this->chat()['requestId'], 'chat', $cost);
    }

    private function refused(int $cost): void
    {
        $before = $this->funds(); $requests = DB::table('assistant_requests')->count();
        try { $this->reserveCost($cost); $this->fail('Expected exposure refusal'); }
        catch (HttpResponseException $e) {
            $this->assertSame(503, $e->getResponse()->getStatusCode());
            $this->assertSame('assistant_capacity', json_decode($e->getResponse()->getContent(), true)['code']);
        }
        $this->assertSame($before, $this->funds());
        $this->assertSame($requests, DB::table('assistant_requests')->count());
    }

    public function test_funded_settled_calls_can_exceed_the_old_fifty_dollar_monthly_ceiling(): void
    {
        config(['assistant.month_micro_usd' => 0]);
        app(Wallet::class)->grant($this->user->id, 'funded-capacity', 'topup', 100_000_000);
        for ($i = 0; $i < 2; $i++) app(Budget::class)->finish($this->reserveCost(30_000_000), 30_000_000);
        $this->assertSame(41_000_000, $this->funds());
        $this->assertEquals(60_000_000, DB::table('assistant_buckets')->where('id', 'month:'.now()->utc()->format('Ym'))->value('micro_usd'));
        $this->assertDatabaseCount('assistant_requests', 2);
        $this->assertEquals(0, DB::table('vibes_spend_days')->sum('held'));
    }

    public function test_refunded_unknown_cost_and_inflight_reservations_keep_their_own_limit(): void
    {
        config(['assistant.month_micro_usd' => 0, 'assistant.uncertain_month_micro_usd' => 6000]);
        app(Budget::class)->finish($this->reserveCost(5000), null);
        $this->assertSame(1_000_000, $this->funds());
        $this->refused(1001);
        $id = $this->reserveCost(1000);
        $this->refused(1);
        app(Budget::class)->finish($id, 100);
        $this->assertNotEmpty($this->reserveCost(1000));
    }

    public function test_prior_month_unknowns_age_out_but_unrecovered_reservations_do_not(): void
    {
        config(['assistant.month_micro_usd' => 0, 'assistant.uncertain_month_micro_usd' => 6000]);
        $this->travelTo(now()->utc()->startOfMonth()->subMinute());
        app(Budget::class)->finish($this->reserveCost(5000), null);
        $held = $this->reserveCost(1000);
        $this->travel(4)->minutes();
        $this->refused(5001);
        app(Budget::class)->finish($held, 100);
        $this->assertNotEmpty($this->reserveCost(6000));
    }

    public function test_disabled_month_ceiling_does_not_disable_wallet_or_daily_admission(): void
    {
        config(['assistant.month_micro_usd' => 0, 'vibes.daily_micro_usd_limit' => 1]);
        $this->refused(2);
        config(['vibes.daily_micro_usd_limit' => 100_000_000]);
        DB::table('vibes_grants')->where('user_id', $this->user->id)->update(['remaining' => 0]);
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(402)->assertJsonPath('code', 'assistant_tokens');
        $this->assertDatabaseCount('assistant_requests', 0);
    }

    public function test_invalid_negative_month_limit_and_zero_risk_limit_fail_closed(): void
    {
        config(['assistant.month_micro_usd' => -1]); $this->refused(1);
        config(['assistant.month_micro_usd' => 0, 'assistant.uncertain_month_micro_usd' => 0]); $this->refused(1);
    }
}
