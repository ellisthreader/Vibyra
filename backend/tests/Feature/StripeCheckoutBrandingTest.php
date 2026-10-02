<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Checkout, Enrollment};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\StripeClient;
use Tests\TestCase;

class StripeCheckoutBrandingTest extends TestCase
{
    use RefreshDatabase;

    public static function offers(): array
    {
        return [['pro_monthly', 'subscription'], ['pro_annual', 'subscription'],
            ['tokens_80', 'payment'], ['tokens_200', 'payment'], ['tokens_450', 'payment']];
    }

    #[DataProvider('offers')]
    public function test_vibyra_header_is_scoped_to_each_checkout_without_changing_purchase_or_merchant(string $offer, string $mode): void
    {
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true,
            'membership.stripe_portal_configuration' => 'bpc_vibyra',
            'membership.offers.'.$offer.'.stripe' => 'price_'.$offer]);
        $user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0,
            'stripe_customer_id' => 'cus_qa']);
        app(Wallet::class)->ensure($user, 0);
        app(Enrollment::class)->migrate($user, 0);
        $request = (string) Str::uuid();
        $sessions = Mockery::mock();
        $sessions->shouldReceive('create')->once()->andReturnUsing(function ($payload, $options) use ($offer, $mode, $request) {
            $this->assertSame(['display_name' => 'Vibyra'], $payload['branding_settings']);
            $this->assertSame($mode, $payload['mode']);
            $this->assertSame('cus_qa', $payload['customer']);
            $this->assertSame([['price' => 'price_'.$offer, 'quantity' => 1]], $payload['line_items']);
            $this->assertSame(['membershipOrder' => $request], $payload['metadata']);
            $this->assertSame(['membershipOrder' => $request], $payload[$mode === 'subscription' ? 'subscription_data' : 'payment_intent_data']['metadata']);
            $this->assertSame(['idempotency_key' => 'membership-checkout:'.$request], $options);
            $this->assertArrayNotHasKey('on_behalf_of', $payload);
            $this->assertFalse($payload['allow_promotion_codes']);
            return (object) ['id' => 'cs_branded', 'url' => 'https://checkout.stripe.com/qa', 'expires_at' => time() + 3600];
        });
        $stripe = Mockery::mock(StripeClient::class);
        // No accounts/settings service is available: global merchant mutations fail this test.
        $stripe->shouldReceive('getService')->with('checkout')->andReturn((object) ['sessions' => $sessions]);
        $input = ['offerKey' => $offer, 'offerVersion' => config('membership.version'), 'requestId' => $request,
            'branding_settings' => ['display_name' => 'Untrusted client name']];
        $checkout = app(Checkout::class);
        $this->assertSame('https://checkout.stripe.com/qa', $checkout->create($user, $input, $stripe));
        $this->assertSame('https://checkout.stripe.com/qa', $checkout->create($user, $input, $stripe));
        $this->assertSame(1, DB::table('membership_orders')->count());
        $this->assertNull(DB::table('membership_orders')->value('fulfilled_at'));
        $this->assertSame(0, app(Wallet::class)->available($user->id));
    }
}
