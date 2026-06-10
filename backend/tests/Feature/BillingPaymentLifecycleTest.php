<?php

namespace Tests\Feature;

use App\Http\Controllers\Concerns\BillingCheckoutActions;
use App\Models\IapReceipt;
use App\Models\MembershipCancellationFeedback;
use App\Models\User;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\StripeWebhookProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Stripe\Event;
use Tests\TestCase;

class BillingPaymentLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_expired_iap_subscription_is_revoked_before_refresh(): void
    {
        $user = User::factory()->create([
            'plan' => 'pro',
            'plan_billing_cycle' => 'annual',
            'plan_renews_at' => now()->subMinute(),
            'billing_provider' => 'iap-apple',
            'credits_balance' => 1,
        ]);
        IapReceipt::create([
            'user_id' => $user->id,
            'platform' => 'apple',
            'product_id' => 'app.vibyra.membership.pro.annual',
            'transaction_id' => 'expired-transaction',
            'expires_at' => now()->subDay(),
        ]);

        $this->artisan('vibyra:refresh-credits')->assertSuccessful();

        $user->refresh();
        $this->assertSame('free', $user->plan);
        $this->assertNull($user->billing_provider);
        $this->assertNull($user->plan_renews_at);
        $this->assertSame(1, $user->credits_balance);
    }

    public function test_past_due_stripe_subscription_is_revoked(): void
    {
        $user = User::factory()->create([
            'plan' => 'builder',
            'billing_provider' => 'stripe',
            'stripe_subscription_id' => 'sub_past_due',
        ]);
        $event = Event::constructFrom([
            'type' => 'customer.subscription.updated',
            'data' => ['object' => [
                'id' => 'sub_past_due',
                'status' => 'past_due',
                'metadata' => ['userId' => (string) $user->id],
            ]],
        ]);

        (new BillingWebhookHarness(app(CreditDeductor::class)))->dispatch($event);

        $user->refresh();
        $this->assertSame('free', $user->plan);
        $this->assertNull($user->billing_provider);
        $this->assertNull($user->stripe_subscription_id);
    }

    public function test_scheduled_manual_cancellation_reverts_to_free_after_paid_term(): void
    {
        $user = User::factory()->create([
            'plan' => 'pro',
            'plan_billing_cycle' => 'annual',
            'plan_renews_at' => now()->subMinute(),
            'membership_ends_at' => now()->subMinute(),
            'membership_cancel_at_period_end' => true,
            'billing_provider' => 'manual',
            'credits_balance' => 900,
        ]);
        MembershipCancellationFeedback::create([
            'user_id' => $user->id,
            'plan' => 'pro',
            'billing_cycle' => 'annual',
            'billing_provider' => 'manual',
            'reason' => 'temporary_break',
            'status' => 'scheduled',
            'confirmed_at' => now()->subMonth(),
        ]);

        $this->artisan('vibyra:refresh-credits')->assertSuccessful();

        $user->refresh();
        $this->assertSame('free', $user->plan);
        $this->assertNull($user->membership_ends_at);
        $this->assertFalse($user->membership_cancel_at_period_end);
        $this->assertNull($user->plan_renews_at);
        $this->assertSame((int) config('billing.plans.free.monthly_credits'), $user->credits_balance);
        $this->assertDatabaseHas('membership_cancellation_feedback', [
            'user_id' => $user->id,
            'status' => 'completed',
        ]);
    }

    public function test_duplicate_stripe_event_is_persisted_and_applied_once(): void
    {
        $user = User::factory()->create([
            'stripe_customer_id' => 'cus_duplicate',
            'credits_balance' => 10,
        ]);
        $event = Event::constructFrom([
            'id' => 'evt_duplicate_topup',
            'object' => 'event',
            'created' => 1_800_000_000,
            'type' => 'checkout.session.completed',
            'data' => ['object' => [
                'id' => 'cs_duplicate_topup',
                'object' => 'checkout.session',
                'customer' => 'cus_duplicate',
                'mode' => 'payment',
                'payment_status' => 'paid',
                'metadata' => [
                    'userId' => (string) $user->id,
                    'topup' => 'topup_500',
                ],
            ]],
        ]);
        $harness = new BillingWebhookHarness(app(CreditDeductor::class));
        $processor = app(StripeWebhookProcessor::class);

        $this->assertSame('processed', $processor->process(
            $event,
            fn () => $harness->dispatch($event)
        ));
        $this->assertSame('duplicate', $processor->process(
            $event,
            fn () => $harness->dispatch($event)
        ));

        $this->assertSame(510, $user->fresh()->credits_balance);
        $this->assertDatabaseCount('stripe_webhook_events', 1);
        $this->assertDatabaseHas('stripe_webhook_events', [
            'event_id' => 'evt_duplicate_topup',
            'status' => 'processed',
            'attempts' => 1,
        ]);
        $this->assertSame(
            1,
            \DB::table('credit_ledger')->where('reference', 'stripe:cs_duplicate_topup')->count()
        );
    }

    public function test_stale_stripe_event_cannot_restore_revoked_subscription(): void
    {
        $user = User::factory()->create([
            'plan' => 'builder',
            'billing_provider' => 'stripe',
            'stripe_customer_id' => 'cus_ordered',
            'stripe_subscription_id' => 'sub_ordered',
        ]);
        $newerFailure = Event::constructFrom([
            'id' => 'evt_newer_failure',
            'object' => 'event',
            'created' => 1_800_000_200,
            'type' => 'invoice.payment_failed',
            'data' => ['object' => [
                'id' => 'in_newer_failure',
                'object' => 'invoice',
                'customer' => 'cus_ordered',
                'subscription' => 'sub_ordered',
            ]],
        ]);
        $olderCheckout = Event::constructFrom([
            'id' => 'evt_older_checkout',
            'object' => 'event',
            'created' => 1_800_000_100,
            'type' => 'checkout.session.completed',
            'data' => ['object' => [
                'id' => 'cs_older_checkout',
                'object' => 'checkout.session',
                'customer' => 'cus_ordered',
                'subscription' => 'sub_ordered',
                'mode' => 'subscription',
                'payment_status' => 'paid',
                'metadata' => [
                    'userId' => (string) $user->id,
                    'plan' => 'builder',
                    'cycle' => 'monthly',
                ],
            ]],
        ]);
        $harness = new BillingWebhookHarness(app(CreditDeductor::class));
        $processor = app(StripeWebhookProcessor::class);

        $processor->process($newerFailure, fn () => $harness->dispatch($newerFailure));
        $this->assertSame(
            'stale',
            $processor->process($olderCheckout, fn () => $harness->dispatch($olderCheckout))
        );

        $user->refresh();
        $this->assertSame('free', $user->plan);
        $this->assertNull($user->stripe_subscription_id);
        $this->assertDatabaseHas('stripe_webhook_events', [
            'event_id' => 'evt_older_checkout',
            'status' => 'ignored',
            'last_error' => 'stale_event',
        ]);
    }

    public function test_stripe_event_customer_must_match_the_account(): void
    {
        $user = User::factory()->create([
            'stripe_customer_id' => 'cus_expected',
            'credits_balance' => 10,
        ]);
        $event = Event::constructFrom([
            'id' => 'evt_wrong_customer',
            'object' => 'event',
            'created' => 1_800_000_300,
            'type' => 'checkout.session.completed',
            'data' => ['object' => [
                'id' => 'cs_wrong_customer',
                'object' => 'checkout.session',
                'customer' => 'cus_attacker',
                'mode' => 'payment',
                'payment_status' => 'paid',
                'metadata' => [
                    'userId' => (string) $user->id,
                    'topup' => 'topup_500',
                ],
            ]],
        ]);
        $harness = new BillingWebhookHarness(app(CreditDeductor::class));

        try {
            app(StripeWebhookProcessor::class)->process(
                $event,
                fn () => $harness->dispatch($event)
            );
            $this->fail('Expected Stripe customer mismatch to fail.');
        } catch (\RuntimeException $exception) {
            $this->assertSame(
                'Stripe event customer does not match the billing account.',
                $exception->getMessage()
            );
        }

        $this->assertSame(10, $user->fresh()->credits_balance);
        $this->assertDatabaseHas('stripe_webhook_events', [
            'event_id' => 'evt_wrong_customer',
            'status' => 'failed',
        ]);
    }
}

class BillingWebhookHarness
{
    use BillingCheckoutActions {
        handleWebhookEvent as public dispatch;
    }

    public function __construct(public CreditDeductor $deductor) {}
}
