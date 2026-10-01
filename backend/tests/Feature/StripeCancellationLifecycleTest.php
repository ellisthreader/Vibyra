<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Enrollment, Entitlements, Periods, StripeEvents};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Stripe\{Event, StripeClient};
use Tests\TestCase;

final class StripeCancellationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_flexible_portal_scheduled_cancellation_and_reactivation_preserve_paid_value(): void
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('a', 32)), 'membership.enabled' => true,
            'membership.stripe_environment' => 'test']);
        $user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($user, 0); app(Enrollment::class)->migrate($user, 0);
        $order = (string) Str::uuid(); $end = now()->addMonth()->startOfSecond();
        DB::table('membership_orders')->insert(['id' => $order, 'user_id' => $user->id,
            'offer_key' => 'pro_monthly', 'offer_version' => config('membership.version'), 'price_id' => 'price_pro',
            'customer_id' => 'cus_fixture', 'created_at' => now(), 'updated_at' => now()]);
        app(Periods::class)->grant($user->id, ['reference' => 'stripe:test:invoice:in_fixture', 'order_id' => $order,
            'provider' => 'stripe', 'environment' => 'test', 'subscription_id' => 'sub_fixture', 'payment_id' => 'pi_fixture',
            'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => $end,
            'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        // Shape observed from the real Stripe portal using flexible billing and the pinned API.
        $canonical = (object) ['id' => 'sub_fixture', 'customer' => 'cus_fixture', 'status' => 'active',
            'metadata' => (object) ['membershipOrder' => $order], 'cancel_at_period_end' => false,
            'cancel_at' => $end->timestamp, 'canceled_at' => now()->timestamp, 'ended_at' => null];
        $subscriptions = Mockery::mock();
        $subscriptions->shouldReceive('retrieve')->with('sub_fixture')->andReturnUsing(fn () => $canonical);
        $stripe = Mockery::mock(StripeClient::class);
        $stripe->shouldReceive('getService')->with('subscriptions')->andReturn($subscriptions);
        $deliver = fn ($id) => app(StripeEvents::class)->handle(Event::constructFrom(['id' => $id,
            'livemode' => false, 'type' => 'customer.subscription.updated',
            'data' => ['object' => ['id' => 'sub_fixture']]]), $stripe);
        $deliver('evt_cancel');
        $this->assertTrue((bool) DB::table('membership_periods')->value('cancel_at_end'));
        $this->assertSame('pro', app(Entitlements::class)->for($user)['tier']);
        $this->assertSame(3000000, app(Wallet::class)->available($user->id));
        $this->assertSame($end->toDateTimeString(), DB::table('membership_periods')->value('ends_at'));

        $canonical->cancel_at = null; $canonical->canceled_at = null;
        $deliver('evt_resume');
        $this->assertFalse((bool) DB::table('membership_periods')->value('cancel_at_end'));
        $this->assertSame('pro', app(Entitlements::class)->for($user)['tier']);
        $this->assertSame(3000000, app(Wallet::class)->available($user->id));
        $this->assertSame(1, DB::table('membership_periods')->count());

        $canonical->cancel_at = now()->subMinute()->timestamp;
        $deliver('evt_past_cancel_date');
        $this->assertFalse((bool) DB::table('membership_periods')->value('cancel_at_end'));
        $this->assertSame($end->toDateTimeString(), DB::table('membership_periods')->value('ends_at'));

        $canonical->cancel_at_period_end = true;
        $deliver('evt_legacy_cancel');
        $this->assertTrue((bool) DB::table('membership_periods')->value('cancel_at_end'));
        $this->assertSame($end->toDateTimeString(), DB::table('membership_periods')->value('ends_at'));
    }
}
