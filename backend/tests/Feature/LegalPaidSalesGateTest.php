<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\Offers;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LegalPaidSalesGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalogue_reports_when_website_sales_are_actually_available(): void
    {
        config([
            'legal.paid_sales_enabled' => true,
            'membership.enabled' => true,
            'membership.new_accounts_from' => '2026-09-01',
            'membership.trial_days' => 14,
            'membership.free_enabled' => true,
            'membership.stripe_enabled' => true,
            'membership.stripe_portal_configuration' => 'portal_test_only',
            'services.stripe.secret' => 'sk_test_only',
            'services.stripe.webhook_secret' => 'whsec_test_only',
            'membership.offers.pro_monthly.stripe' => 'price_test_only',
        ]);

        $this->getJson('/api/billing/catalogue?version=2')->assertOk()
            ->assertJsonPath('salesEnabled', true)
            ->assertJsonPath('webSalesEnabled', true)
            ->assertJsonPath('trialEnabled', true)
            ->assertJsonPath('trialDays', 14)
            ->assertJsonPath('freePilotEnabled', true);
    }

    public function test_new_web_and_app_checkouts_remain_closed_until_released(): void
    {
        config(['legal.paid_sales_enabled' => false]);
        $user = User::factory()->create();

        $this->getJson('/api/billing/catalogue?version=2')->assertOk()
            ->assertJsonPath('salesEnabled', false)
            ->assertJsonPath('webSalesEnabled', false)
            ->assertJsonPath('trialEnabled', false)
            ->assertJsonPath('freePilotEnabled', false);

        $this->actingAs($user)->postJson('/web-api/billing/checkout', [
            'kind' => 'subscription', 'plan' => 'pro', 'cycle' => 'monthly',
        ])->assertStatus(503)->assertJsonPath('ok', false);
        $this->postJson('/api/billing/checkout', [
            'kind' => 'subscription', 'plan' => 'pro', 'cycle' => 'monthly',
        ])->assertStatus(503)->assertJsonPath('ok', false);
        VibyraSession::create([
            'user_id' => $user->id, 'token_hash' => hash('sha256', 'legal-sales-test'),
            'device_name' => 'Legal test',
        ]);
        $this->withToken('legal-sales-test');
        $this->postJson('/api/vibes/purchases/preflight', [
            'productId' => 'any-product',
        ])->assertStatus(503);

        foreach (app(Offers::class)->all() as $offer) {
            $this->assertFalse($offer['stripeEnabled']);
            $this->assertFalse($offer['appleEnabled']);
        }
    }

    public function test_future_new_account_start_does_not_advertise_trial_or_free_pilot(): void
    {
        config([
            'membership.enabled' => true,
            'membership.new_accounts_from' => now()->addDay()->toIso8601String(),
            'membership.trial_days' => 14,
            'membership.free_enabled' => true,
        ]);

        $this->getJson('/api/billing/catalogue?version=2')->assertOk()
            ->assertJsonPath('trialEnabled', false)
            ->assertJsonPath('freePilotEnabled', false);
    }
}
