<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingAccountPayloadTest extends TestCase
{
    use RefreshDatabase;

    public function test_session_exposes_safe_desktop_billing_management_fields(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Billing User',
            'email' => 'billing-payload@example.test',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        User::where('email', 'billing-payload@example.test')->update([
            'billing_provider' => 'stripe',
            'plan' => 'builder',
            'plan_billing_cycle' => 'annual',
            'plan_renews_at' => now()->addMonth(),
            'membership_ends_at' => now()->addYear(),
            'membership_cancel_at_period_end' => true,
            'stripe_customer_id' => 'cus_test_payload',
        ]);

        $this->getJson('/api/session', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('user.billingProvider', 'stripe')
            ->assertJsonPath('user.canManageStripeBilling', true)
            ->assertJsonPath('user.billingCurrency', 'gbp')
            ->assertJsonPath('user.billingVatInclusive', true)
            ->assertJsonPath('user.membershipCancelAtPeriodEnd', true)
            ->assertJsonPath('user.membershipEndsAt', fn ($value) => is_string($value) && $value !== '')
            ->assertJsonPath('user.planPricePence', (int) config('billing.plans.builder.annual_price_pence'))
            ->assertJsonPath('user.creditsResetAt', fn ($value) => is_string($value) && $value !== '');
    }

    public function test_iap_subscription_does_not_offer_stripe_management(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'IAP User',
            'email' => 'iap-payload@example.test',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        User::where('email', 'iap-payload@example.test')->update([
            'billing_provider' => 'iap-apple',
            'plan' => 'starter',
        ]);

        $this->getJson('/api/session', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('user.billingProvider', 'iap-apple')
            ->assertJsonPath('user.canManageStripeBilling', false);
    }

    public function test_portal_requires_stripe_configuration(): void
    {
        config(['services.stripe.secret' => '']);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'No Stripe User',
            'email' => 'no-stripe@example.test',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/billing/portal', [], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(503)
            ->assertJsonPath('ok', false);
    }

    public function test_portal_requires_a_stripe_customer(): void
    {
        config(['services.stripe.secret' => 'sk_test_not_used']);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'No Customer User',
            'email' => 'no-customer@example.test',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/billing/portal', [], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('ok', false);
    }

}
