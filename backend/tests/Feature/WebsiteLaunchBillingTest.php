<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Billing\{GooglePlayAccessTokenProvider, IapReceiptVerifier};
use App\Services\Membership\Offers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteLaunchBillingTest extends TestCase
{
    use RefreshDatabase;

    private function apple(array $changes = [], array $entry = []): array
    {
        return array_replace_recursive(['status' => 0, 'environment' => 'Production',
            'receipt' => ['bundle_id' => 'app.vibyra.mobile', 'in_app' => [[
                'product_id' => 'app.vibyra.membership.pro.monthly', 'transaction_id' => 'tx-1',
                'original_transaction_id' => 'tx-1', 'expires_date_ms' => now()->addDays(2)->getTimestampMs(),
                ...$entry,
            ]]]], $changes);
    }

    private function verify(array $payload): array
    {
        Http::fake(['*' => Http::response($payload)]);
        return app(IapReceiptVerifier::class)->verify('apple', 'app.vibyra.membership.pro.monthly', 'receipt');
    }

    public function test_apple_sandbox_never_falls_back_to_free_test_payment(): void
    {
        Http::fake(['*' => Http::response(['status' => 21007])]);
        try {
            app(IapReceiptVerifier::class)->verify('apple', 'app.vibyra.membership.pro.monthly', 'receipt');
            $this->fail('Sandbox was accepted');
        } catch (\RuntimeException $e) { $this->assertStringContainsString('Test purchases', $e->getMessage()); }
        Http::assertSentCount(1);
    }

    public function test_wrong_bundle_sandbox_and_refunded_receipts_are_rejected(): void
    {
        foreach ([$this->apple(['receipt' => ['bundle_id' => 'another.app']]),
            $this->apple(['environment' => 'Sandbox']), $this->apple([], ['cancellation_date_ms' => '123']),
            $this->apple([], ['expires_date_ms' => 0])] as $payload) {
            try { $this->verify($payload); $this->fail('Invalid store receipt was accepted'); }
            catch (\RuntimeException $e) { $this->assertNotSame('', $e->getMessage()); }
        }
    }

    public function test_real_receipt_grants_only_until_verified_expiry(): void
    {
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'paid-token'), 'last_used_at' => now()]);
        $expiry = now()->addDays(2)->startOfSecond();
        Http::fake(['*' => Http::response($this->apple([], ['expires_date_ms' => $expiry->getTimestampMs()]))]);
        $this->postJson('/api/billing/iap-receipt', ['platform' => 'apple',
            'productId' => 'app.vibyra.membership.pro.monthly', 'transactionId' => 'tx-1', 'receipt' => 'receipt'],
            ['Authorization' => 'Bearer paid-token'])->assertOk();
        $this->assertTrue($expiry->equalTo($user->fresh()->membership_ends_at));
        $this->assertSame('pro', $user->fresh()->plan);
    }

    public function test_google_test_topup_and_test_subscription_are_rejected(): void
    {
        config(['services.google_iap.package_name' => 'app.vibyra.mobile']);
        $this->mock(GooglePlayAccessTokenProvider::class)->shouldReceive('token')->andReturn('token');
        foreach ([['purchaseType' => 0], ['testPurchase' => []]] as $payload) {
            Http::fake(['*' => Http::response($payload)]);
            try {
                app(IapReceiptVerifier::class)->verify('google', 'app.vibyra.topup.500', 'purchase-token');
                $this->fail('Test Google purchase was accepted');
            } catch (\RuntimeException $e) { $this->assertStringContainsString('Test purchases', $e->getMessage()); }
        }
    }

    public function test_production_catalogue_never_advertises_test_stripe_sales(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true,
            'membership.stripe_portal_configuration' => 'portal', 'membership.stripe_environment' => 'live',
            'membership.offers.pro_monthly.stripe' => 'price', 'services.stripe.secret' => 'sk_test_fake',
            'services.stripe.webhook_secret' => 'whsec_fake']);
        $this->assertFalse(collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['stripeEnabled']);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'stripe-test-token'), 'last_used_at' => now()]);
        $this->postJson('/api/billing/checkout', ['plan' => 'pro', 'cycle' => 'monthly'],
            ['Authorization' => 'Bearer stripe-test-token'])->assertStatus(503);
        config(['services.stripe.secret' => 'sk_live_fake']);
        $this->assertTrue(collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['stripeEnabled']);
        config(['services.stripe.secret' => 'rk_live_fixture']);
        $this->assertTrue(collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['stripeEnabled']);
        config(['services.stripe.secret' => 'rk_test_fixture']);
        $this->assertFalse(collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['stripeEnabled']);
    }
    public function test_paid_sales_gate_blocks_catalogue_and_modern_and_legacy_checkout(): void
    {
        config(['legal.paid_sales_enabled' => false, 'membership.enabled' => true,
            'membership.stripe_enabled' => true, 'membership.stripe_portal_configuration' => 'portal',
            'membership.offers.pro_monthly.stripe' => 'price', 'services.stripe.secret' => 'sk_test_fake',
            'services.stripe.webhook_secret' => 'whsec_fake']);
        $user = User::factory()->create();
        $this->assertFalse(collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly')['stripeEnabled']);
        $this->actingAs($user)->postJson('/web-api/billing/checkout', ['offerKey' => 'pro_monthly',
            'offerVersion' => config('membership.version'), 'requestId' => (string) \Illuminate\Support\Str::uuid()])->assertStatus(503);
        $this->actingAs($user)->postJson('/web-api/billing/checkout', ['plan' => 'pro', 'cycle' => 'monthly'])->assertStatus(503);
    }

    public function test_signed_test_webhook_cannot_grant_legacy_production_credits(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['services.stripe.webhook_secret' => 'whsec_fixture']);
        $payload = json_encode(['id' => 'evt_fixture', 'object' => 'event', 'livemode' => false,
            'type' => 'checkout.session.completed', 'data' => ['object' => ['id' => 'cs_fixture']]]);
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp.'.'.$payload, 'whsec_fixture');
        $this->call('POST', '/api/billing/webhook', [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}"], $payload)
            ->assertStatus(400)->assertJsonPath('error', 'Test payments are not accepted.');
        $this->assertDatabaseCount('credit_ledger', 0);
    }

}
