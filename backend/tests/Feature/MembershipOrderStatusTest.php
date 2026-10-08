<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Enrollment, Periods, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** The success page polls this: it must say what was bought without leaking anyone else's order. */
class MembershipOrderStatusTest extends TestCase
{
    use RefreshDatabase;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true, 'membership.stripe_environment' => 'test']);
        $this->user = $this->member();
    }
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }
    private function member(): User
    {
        $user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0, 'stripe_customer_id' => 'cus_'.Str::random(6)]);
        app(Wallet::class)->ensure($user, 0);
        app(Enrollment::class)->migrate($user, 0);
        return $user;
    }
    private function order(string $offer, ?User $owner = null): string
    {
        $id = (string) Str::uuid();
        DB::table('membership_orders')->insert(['id' => $id, 'user_id' => ($owner ?? $this->user)->id, 'offer_key' => $offer,
            'offer_version' => config('membership.version'), 'price_id' => 'price_'.$offer, 'customer_id' => 'cus_test',
            'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }
    private function grant(string $order, string $offer, string $reference, ?Carbon $end, int $paid): void
    {
        app(Periods::class)->grant($this->user->id, ['reference' => $reference, 'order_id' => $order, 'provider' => 'stripe',
            'environment' => 'test', 'subscription_id' => $end ? 'sub_'.$order : null, 'payment_id' => 'pi_'.$reference,
            'offer_key' => $offer, 'starts_at' => now(), 'ends_at' => $end,
            'units' => config("membership.offers.$offer.credits") * Units::SCALE, 'paid_minor' => $paid, 'currency' => 'GBP']);
    }
    private function orderStatus(string $order)
    {
        return $this->actingAs($this->user)->getJson("/web-api/billing/orders/$order");
    }

    public function test_an_unpaid_order_already_says_what_is_being_bought(): void
    {
        $this->orderStatus($this->order('pro_monthly'))->assertOk()->assertJson([
            'paid' => false, 'offerKey' => 'pro_monthly', 'kind' => 'subscription', 'plan' => 'pro_v2', 'interval' => 'month', 'credits' => 300,
        ])->assertJsonMissingPath('grantedAt')->assertJsonMissingPath('paidUntil');
    }

    public function test_a_paid_annual_order_reports_the_grant(): void
    {
        Carbon::setTestNow('2026-09-29 10:00:00');
        $order = $this->order('pro_annual');
        $this->grant($order, 'pro_annual', 'in_year', now()->addYear(), 19999);
        Carbon::setTestNow('2026-09-29 10:00:03');
        $this->orderStatus($order)->assertOk()->assertJson([
            'paid' => true, 'kind' => 'subscription', 'interval' => 'year', 'credits' => 3600, 'amountMinor' => 19999, 'currency' => 'GBP',
            'grantedAgoSeconds' => 3, 'refunded' => false,
        ])->assertJsonPath('paidUntil', Carbon::parse('2027-09-29 10:00:00')->toIso8601String());
    }

    public function test_a_top_up_has_no_plan_or_period_end(): void
    {
        $order = $this->order('tokens_80');
        $this->grant($order, 'tokens_80', 'pi_topup', null, 499);
        $this->orderStatus($order)->assertOk()->assertJson(['paid' => true, 'kind' => 'topup', 'plan' => null, 'interval' => null, 'credits' => 80, 'paidUntil' => null]);
    }

    public function test_a_renewal_does_not_make_the_first_purchase_look_new(): void
    {
        Carbon::setTestNow('2026-09-01 09:00:00');
        $order = $this->order('pro_monthly');
        $this->grant($order, 'pro_monthly', 'in_first', now()->addMonth(), 1999);
        Carbon::setTestNow('2026-10-01 09:00:00');
        $this->grant($order, 'pro_monthly', 'in_second', now()->addMonth(), 1999);
        $this->orderStatus($order)->assertOk()->assertJsonPath('grantedAgoSeconds', 30 * 86400)
            ->assertJsonPath('grantedAt', Carbon::parse('2026-09-01 09:00:00')->toIso8601String());
    }

    public function test_a_refund_is_reported_but_the_order_stays_paid(): void
    {
        $order = $this->order('pro_monthly');
        $this->grant($order, 'pro_monthly', 'in_refund', now()->addMonth(), 1999);
        app(Periods::class)->refund('in_refund', 1999);
        $this->orderStatus($order)->assertOk()->assertJson(['paid' => true, 'refunded' => true]);
    }

    public function test_only_the_owner_can_read_an_order(): void
    {
        $order = $this->order('pro_monthly');
        $this->actingAs($this->member())->getJson("/web-api/billing/orders/$order")->assertNotFound();
        auth()->logout();
        $this->getJson("/web-api/billing/orders/$order")->assertUnauthorized();
        $this->actingAs($this->user)->getJson('/web-api/billing/orders/not-a-uuid')->assertClientError();
    }

    public function test_an_offer_removed_from_config_still_answers(): void
    {
        $order = $this->order('pro_monthly');
        config(['membership.offers' => array_diff_key(config('membership.offers'), ['pro_monthly' => 1])]);
        $this->orderStatus($order)->assertOk()->assertJson(['paid' => false, 'kind' => null, 'credits' => null]);
    }
}
