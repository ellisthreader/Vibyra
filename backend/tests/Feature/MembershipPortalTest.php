<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Enrollment, Offers, Portal};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MembershipPortalTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_membership_never_falls_back_to_default_portal(): void
    {
        $user = User::factory()->create(['credits_balance' => 0, 'stripe_customer_id' => 'cus_modern']);
        app(Wallet::class)->ensure($user, 0);
        app(Enrollment::class)->migrate($user, 0);
        config(['membership.stripe_portal_configuration' => null]);
        try {
            app(Portal::class)->parameters($user);
            $this->fail('Modern memberships must not open the default legacy portal.');
        } catch (HttpException $error) {
            $this->assertSame(503, $error->getStatusCode());
        }
        config(['membership.stripe_portal_configuration' => 'bpc_v2']);
        $params = app(Portal::class)->parameters($user);
        $this->assertSame('bpc_v2', $params['configuration']);
        $this->assertSame('cus_modern', $params['customer']);
    }

    public function test_legacy_customers_keep_existing_portal_configuration(): void
    {
        $user = User::factory()->create(['stripe_customer_id' => 'cus_legacy']);
        config(['membership.stripe_portal_configuration' => 'bpc_v2']);
        $params = app(Portal::class)->parameters($user);
        $this->assertArrayNotHasKey('configuration', $params);
        $this->assertSame('cus_legacy', $params['customer']);
    }

    public function test_offers_require_membership_management_before_sales(): void
    {
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true,
            'services.stripe.secret' => 'sk_test_fixture', 'services.stripe.webhook_secret' => 'whsec_fixture',
            'membership.offers.pro_monthly.stripe' => 'price_pro', 'membership.stripe_portal_configuration' => null]);
        $offer = fn () => collect(app(Offers::class)->all())->firstWhere('offerKey', 'pro_monthly');
        $this->assertFalse($offer()['stripeEnabled']);
        config(['membership.stripe_portal_configuration' => 'bpc_v2']);
        $this->assertTrue($offer()['stripeEnabled']);
    }
}
