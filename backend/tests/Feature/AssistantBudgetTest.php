<?php
namespace Tests\Feature;

use App\Services\Assistant\{Budget, Holds};
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AssistantBudgetTest extends TestCase
{
    use RefreshDatabase, AssistantFixture;
    private function reserve(int $cost = 5000): string
    {
        return app(Budget::class)->reserve($this->user->id, $this->chat()['requestId'], 'chat', $cost);
    }
    public function test_budget_reservation_and_token_hold_are_atomic_and_settlement_is_idempotent(): void
    {
        $id = $this->reserve();
        $this->assertSame(5000, Holds::units($this->user->id));
        $payload = app(Wallet::class)->payload($this->user->id);
        $this->assertSame('5000', $payload['heldUnits']);
        app(Budget::class)->finish($id, 123); app(Budget::class)->finish($id, 5000);
        $this->assertSame(999877, $this->funds());
        $this->assertSame(0, Holds::units($this->user->id));
        $this->assertEquals(123, DB::table('vibes_spend_days')->sum('spent'));
        $this->assertEquals(0, DB::table('vibes_spend_days')->sum('held'));
    }
    public function test_month_limit_stops_dispatch_and_does_not_debit_tokens(): void
    {
        config(['assistant.month_micro_usd' => 1]);
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(503);
        $this->assertSame(1_000_000, $this->funds());
        $this->assertSame(0, DB::table('assistant_requests')->count());
    }
    public function test_worker_death_sweep_keeps_cost_risk_and_releases_customer_hold_once(): void
    {
        $id = $this->reserve(); $this->travel(6)->minutes();
        $this->artisan('vibyra:recover-assistant')->assertSuccessful();
        $this->artisan('vibyra:recover-assistant')->assertSuccessful();
        $this->assertSame(1_000_000, $this->funds());
        $this->assertDatabaseHas('assistant_requests', ['id' => $id, 'state' => 'uncertain', 'charged_micro_usd' => 5000, 'charged_units' => 0]);
        $this->assertEquals(5000, DB::table('vibes_spend_days')->sum('spent'));
    }
    public function test_expired_promotional_tokens_are_not_resurrected_on_refund(): void
    {
        DB::table('vibes_grants')->update(['remaining' => 0]);
        app(Wallet::class)->grant($this->user->id, 'promo', 'trial', 10000);
        DB::table('vibes_grants')->where('reference', 'promo')->update(['expires_at' => now()->addMinute()]);
        $id = $this->reserve(); $this->travel(2)->minutes(); app(Budget::class)->finish($id, null);
        $this->assertSame(0, $this->funds());
        $this->assertEquals(5000, DB::table('vibes_spend_days')->sum('free_spent'));
    }
    public function test_price_overrun_is_absorbed_above_reserved_tokens_and_trips_service(): void
    {
        $id = $this->reserve(); app(Budget::class)->finish($id, 5001);
        $this->assertSame(995000, $this->funds());
        $this->assertFalse(app(Budget::class)->ready());
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(503);
    }
    public function test_subscription_refund_waits_for_assistant_hold(): void
    {
        DB::table('vibes_grants')->update(['remaining' => 0]);
        $p = ['reference' => 'assistant-subscription', 'provider' => 'stripe', 'environment' => 'live',
            'subscription_id' => 'sub_assistant', 'payment_id' => 'pi_assistant', 'offer_key' => 'pro_monthly',
            'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 100000, 'paid_minor' => 1999, 'currency' => 'GBP'];
        app(Periods::class)->grant($this->user->id, $p); $id = $this->reserve();
        try { app(Periods::class)->refund($p['reference'], 1999); $this->fail('Refund bypassed the hold'); }
        catch (HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $before = $this->funds();
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(503);
        $this->assertSame($before, $this->funds());
        $this->assertDatabaseCount('assistant_requests', 1);
        DB::table('membership_periods')->where('reference', $p['reference'])->update(['disputed' => true]);
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(402);
        $this->assertSame($before, $this->funds());
        DB::table('membership_periods')->where('reference', $p['reference'])->update(['disputed' => false]);
        app(Budget::class)->finish($id, 100); app(Periods::class)->refund($p['reference'], 1999);
        $this->assertSame(0, $this->funds());
    }
}
