<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\Enrollment;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class WebsiteCheckoutAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_real_modern_checkout_handler_records_consented_purchase_kind(): void
    {
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true,
            'membership.stripe_portal_configuration' => 'bpc_fixture',
            'services.stripe.secret' => 'sk_test_fixture',
            'membership.offers.pro_monthly.stripe' => 'price_fixture']);
        $user = User::factory()->create(['credits_balance' => 0, 'email_verified_at' => now(), 'stripe_customer_id' => 'cus_fixture']);
        app(Wallet::class)->ensure($user, 0);
        app(Enrollment::class)->migrate($user, 0);
        $order = (string) Str::uuid();
        DB::table('membership_orders')->insert(['id' => $order, 'user_id' => $user->id,
            'offer_key' => 'pro_monthly', 'offer_version' => config('membership.version'),
            'price_id' => 'price_fixture', 'customer_id' => 'cus_fixture',
            'checkout_url' => 'https://checkout.stripe.com/fixture', 'expires_at' => now()->addHour(),
            'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs($user)->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/checkout')->assertOk();
        foreach (['checkout_signup', 'checkout_login', 'checkout_pay'] as $cta) {
            $this->postJson('/web-api/analytics/event', ['event' => 'website_cta_clicked',
                'event_id' => (string) Str::uuid(), 'dimension' => $cta])->assertAccepted();
        }
        $body = ['offerKey' => 'pro_monthly', 'offerVersion' => config('membership.version'), 'requestId' => $order];
        $this->postJson('/web-api/billing/checkout', $body)->assertOk();
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_checkout_started', 'dimension' => 'subscription']);
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_page_view', 'dimension' => '/checkout']);
        $this->putJson('/web-api/analytics/consent', ['choice' => 'declined', 'policy_version' => 1])->assertOk();
        $this->postJson('/web-api/billing/checkout', $body)->assertOk();
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_checkout_started']);
    }
}
