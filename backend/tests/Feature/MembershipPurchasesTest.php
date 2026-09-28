<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{ApplePurchases, Checkout, Enrollment, Offers, StripeEvents};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Stripe\{Event, StripeClient};
use Tests\TestCase;

class MembershipPurchasesTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true,
            'membership.stripe_environment' => 'test', 'membership.stripe_portal_configuration' => 'bpc_membership', 'membership.offers.pro_monthly.stripe' => 'price_pro', 'membership.offers.pro_annual.stripe' => 'price_pro_annual',
            'membership.offers.tokens_80.stripe' => 'price_tokens']);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0, 'stripe_customer_id' => 'cus_test']);
        app(Wallet::class)->ensure($this->user, 0);
        app(Enrollment::class)->migrate($this->user, 0);
    }
    private function order(string $offer = 'pro_monthly'): string
    {
        $id = (string) Str::uuid();
        DB::table('membership_orders')->insert(['id' => $id, 'user_id' => $this->user->id,
            'offer_key' => $offer, 'offer_version' => config('membership.version'),
            'price_id' => ['pro_monthly' => 'price_pro', 'pro_annual' => 'price_pro_annual'][$offer] ?? 'price_tokens', 'customer_id' => 'cus_test',
            'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }
    private function client(array $responses): StripeClient
    {
        $client = Mockery::mock(StripeClient::class);
        foreach ($responses as $name => $value) {
            $service = Mockery::mock(); $service->shouldReceive('retrieve')->andReturn($this->object($value));
            $client->shouldReceive('getService')->with($name)->andReturn($service);
        }
        return $client;
    }
    private function object(array $value): object { return json_decode(json_encode($value)); }
    private function event(string $id, string $type, array $o): Event
    {
        return Event::constructFrom(['id' => $id, 'livemode' => false, 'type' => $type, 'data' => ['object' => $o]]);
    }
    public function test_paid_invoice_grants_once_across_different_delivery_ids(): void
    {
        $order = $this->order();
        $invoice = ['id' => 'in_paid', 'status' => 'paid', 'subscription' => 'sub_test', 'customer' => 'cus_test',
            'amount_paid' => 1999, 'currency' => 'gbp', 'payment_intent' => 'pi_test', 'lines' => ['data' => [[
                'price' => ['id' => 'price_pro'], 'quantity' => 1, 'period' => ['start' => time(), 'end' => time() + 2592000]]]]];
        $stripe = $this->client(['invoices' => $invoice, 'subscriptions' => ['id' => 'sub_test', 'metadata' => ['membershipOrder' => $order], 'status' => 'active']]);
        $events = app(StripeEvents::class);
        $this->assertTrue($events->handle($this->event('evt_a', 'invoice.paid', ['id' => 'in_paid']), $stripe));
        $this->assertTrue($events->handle($this->event('evt_a', 'invoice.paid', ['id' => 'in_paid']), $stripe));
        $this->assertTrue($events->handle($this->event('evt_b', 'invoice.paid', ['id' => 'in_paid']), $stripe));
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
        $this->assertNotNull(DB::table('membership_orders')->where('id', $order)->value('fulfilled_at'));
    }
    public function test_paid_annual_invoice_grants_a_year_of_tokens_once(): void
    {
        $order = $this->order('pro_annual');
        $invoice = ['id' => 'in_year', 'status' => 'paid', 'subscription' => 'sub_year', 'customer' => 'cus_test',
            'amount_paid' => 19999, 'currency' => 'gbp', 'payment_intent' => 'pi_year', 'lines' => ['data' => [[
                'price' => ['id' => 'price_pro_annual'], 'quantity' => 1, 'period' => ['start' => time(), 'end' => time() + 31536000]]]]];
        $stripe = $this->client(['invoices' => $invoice, 'subscriptions' => ['id' => 'sub_year', 'metadata' => ['membershipOrder' => $order], 'status' => 'active']]);
        $events = app(StripeEvents::class);
        $this->assertTrue($events->handle($this->event('evt_year', 'invoice.paid', ['id' => 'in_year']), $stripe));
        $this->assertTrue($events->handle($this->event('evt_year_again', 'invoice.paid', ['id' => 'in_year']), $stripe));
        $this->assertSame(36000000, app(Wallet::class)->available($this->user->id));
    }
    public function test_annual_offer_is_on_the_website_catalogue_but_not_in_the_app(): void
    {
        $annual = collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_annual');
        $this->assertSame(['year', 19999, 3600, null, false], [$annual['interval'], $annual['pence'], $annual['credits'], $annual['id'], $annual['appleEnabled']]);
        $this->assertSame('month', collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['interval']);
        $products = app(Wallet::class)->payload($this->user->id)['products'];
        $this->assertNotContains('pro_annual', array_column($products, 'offerKey'));
        $this->assertContains('pro_monthly', array_column($products, 'offerKey'));
    }
    public function test_delayed_topup_grants_only_after_canonical_payment_is_paid(): void
    {
        $order = $this->order('tokens_80');
        $retrieve = Mockery::mock();
        $session = ['id' => 'cs_topup', 'customer' => 'cus_test', 'mode' => 'payment', 'payment_status' => 'unpaid',
            'payment_intent' => 'pi_topup', 'amount_total' => 499, 'currency' => 'gbp', 'created' => time(),
            'line_items' => ['data' => [['price' => ['id' => 'price_tokens'], 'quantity' => 1]]]];
        $retrieve->shouldReceive('retrieve')->andReturn($this->object($session), $this->object([...$session, 'payment_status' => 'paid']));
        $stripe = Mockery::mock(StripeClient::class);
        $stripe->shouldReceive('getService')->with('checkout')->andReturn((object) ['sessions' => $retrieve]);
        $hint = ['id' => 'cs_topup', 'metadata' => ['membershipOrder' => $order]];
        app(StripeEvents::class)->handle($this->event('evt_pending', 'checkout.session.completed', $hint), $stripe);
        $this->assertSame(0, app(Wallet::class)->available($this->user->id));
        app(StripeEvents::class)->handle($this->event('evt_paid', 'checkout.session.async_payment_succeeded', $hint), $stripe);
        $this->assertSame(800000, app(Wallet::class)->available($this->user->id));
    }
    public function test_checkout_timeout_keeps_order_and_reuses_provider_idempotency_key(): void
    {
        $service = Mockery::mock(); $keys = [];
        $service->shouldReceive('create')->andReturnUsing(function ($params, $opts) use (&$keys) {
            $keys[] = $opts['idempotency_key'];
            if (count($keys) === 1) throw new \RuntimeException('simulated connection loss');
            return (object) ['id' => 'cs_retry', 'url' => 'https://checkout.stripe.com/test', 'expires_at' => time() + 3600];
        });
        $stripe = Mockery::mock(StripeClient::class);
        $stripe->shouldReceive('getService')->with('checkout')->andReturn((object) ['sessions' => $service]);
        $input = ['offerKey' => 'pro_monthly', 'offerVersion' => config('membership.version'), 'requestId' => (string) Str::uuid()];
        try { app(Checkout::class)->create($this->user, $input, $stripe); $this->fail('Expected timeout'); }
        catch (\RuntimeException $e) { $this->assertSame('simulated connection loss', $e->getMessage()); }
        $this->assertSame(1, DB::table('membership_orders')->count());
        $input['requestId'] = (string) Str::uuid();
        $this->assertSame('https://checkout.stripe.com/test', app(Checkout::class)->create($this->user, $input, $stripe));
        $this->assertSame($keys[0], $keys[1]);
    }
    public function test_apple_verified_purchase_restore_and_partial_refund(): void
    {
        $offer = app(Offers::class)->apple('app.vibyra.tokens.80.v2');
        $t = ['transactionId' => '123', 'originalTransactionId' => '123', 'purchaseDate' => now()->getTimestampMs(),
            'price' => 4990, 'currency' => 'GBP', 'environment' => 'Production', 'inAppOwnershipType' => 'PURCHASED',
            'appAccountToken' => DB::table('vibes_wallets')->where('user_id', $this->user->id)->value('account_token')];
        DB::transaction(fn () => app(ApplePurchases::class)->apply($this->user->id, $t, $offer));
        DB::transaction(fn () => app(ApplePurchases::class)->apply($this->user->id, $t, $offer));
        $this->assertSame(800000, app(Wallet::class)->available($this->user->id));
        $t += ['revocationDate' => now()->getTimestampMs(), 'revocationType' => 'REFUND_PRORATED', 'revocationPercentage' => 50000];
        DB::transaction(fn () => app(ApplePurchases::class)->apply($this->user->id, $t, $offer));
        $this->assertSame(400000, app(Wallet::class)->available($this->user->id));
    }
    public function test_refund_arriving_before_topup_stays_retryable(): void
    {
        $order = $this->order('tokens_80');
        $stripe = $this->client(['charges' => ['id' => 'ch_early', 'payment_intent' => 'pi_early'],
            'paymentIntents' => ['metadata' => ['membershipOrder' => $order]]]);
        try {
            app(StripeEvents::class)->handle($this->event('evt_early', 'charge.refunded', ['id' => 'ch_early']), $stripe);
            $this->fail('An out-of-order refund must be retried.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(503, $e->getStatusCode());
        }
        $this->assertSame('failed', DB::table('membership_events')->where('id', 'stripe:test:evt_early')->value('status'));
        $this->assertSame(0, app(Wallet::class)->available($this->user->id));
    }

    public function test_apple_cancellation_keeps_paid_period_and_ignores_older_renewal_fact(): void
    {
        $offer = app(Offers::class)->apple('app.vibyra.membership.pro.monthly.v2');
        $t = ['transactionId' => '234', 'originalTransactionId' => '234', 'purchaseDate' => now()->getTimestampMs(),
            'expiresDate' => now()->addMonth()->getTimestampMs(), 'price' => 19990, 'currency' => 'GBP',
            'environment' => 'Production', 'inAppOwnershipType' => 'PURCHASED',
            'appAccountToken' => DB::table('vibes_wallets')->where('user_id', $this->user->id)->value('account_token'),
            'verifiedRenewal' => ['autoRenewStatus' => 0, 'signedDate' => 2000]];
        DB::transaction(fn () => app(ApplePurchases::class)->apply($this->user->id, $t, $offer));
        $t['verifiedRenewal'] = ['autoRenewStatus' => 1, 'signedDate' => 1000];
        DB::transaction(fn () => app(ApplePurchases::class)->apply($this->user->id, $t, $offer));
        $m = app(\App\Services\Membership\Entitlements::class)->for($this->user);
        $this->assertSame('pro', $m['tier']); $this->assertTrue($m['cancelAtEnd']);
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
    }

    public function test_current_invoice_payment_link_supports_refunds_without_charge_invoice(): void
    {
        $order = $this->order();
        $invoice = ['id' => 'in_current', 'status' => 'paid', 'parent' => ['subscription_details' => ['subscription' => 'sub_current']],
            'customer' => 'cus_test', 'amount_paid' => 1999, 'currency' => 'gbp',
            'payments' => ['has_more' => false, 'data' => [['status' => 'paid', 'amount_paid' => 1999,
                'payment' => ['type' => 'payment_intent', 'payment_intent' => 'pi_current']]]],
            'lines' => ['data' => [['pricing' => ['price_details' => ['price' => 'price_pro']], 'quantity' => 1,
                'period' => ['start' => time(), 'end' => time() + 2592000]]]]];
        $stripe = $this->client(['invoices' => $invoice, 'subscriptions' => ['id' => 'sub_current',
            'metadata' => ['membershipOrder' => $order], 'status' => 'active'],
            'charges' => ['id' => 'ch_current', 'payment_intent' => 'pi_current', 'amount_refunded' => 1999]]);
        $events = app(StripeEvents::class);
        $events->handle($this->event('evt_current', 'invoice.paid', ['id' => 'in_current']), $stripe);
        $this->assertSame('pi_current', DB::table('membership_periods')->value('payment_id'));
        $events->handle($this->event('evt_current_refund', 'charge.refunded', ['id' => 'ch_current']), $stripe);
        $this->assertSame(0, app(Wallet::class)->available($this->user->id));
    }

}
