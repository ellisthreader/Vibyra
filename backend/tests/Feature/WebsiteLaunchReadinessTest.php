<?php

namespace Tests\Feature;

use App\Services\Website\LaunchReadiness;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class WebsiteLaunchReadinessTest extends TestCase
{
    public function test_incomplete_production_configuration_fails_without_printing_secrets(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['mail.default' => 'log', 'services.stripe.secret' => 'sk_test_DO_NOT_PRINT',
            'services.stripe.webhook_secret' => null, 'membership.stripe_portal_configuration' => null]);
        $this->assertSame(1, Artisan::call('vibyra:website-launch-readiness'));
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertFalse($payload['ready']);
        $this->assertFalse($payload['checks']['mail_transport_configured']);
        $this->assertFalse($payload['checks']['stripe_live_key']);
        $this->assertStringNotContainsString('DO_NOT_PRINT', Artisan::output());
    }

    public function test_complete_configuration_snapshot_passes_but_claims_no_provider_delivery(): void
    {
        $this->readyConfig();
        $this->assertSame(0, Artisan::call('vibyra:website-launch-readiness'));
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertTrue($payload['ready']);
        $this->assertSame('configuration_only', $payload['scope']);
        $this->assertStringNotContainsString('DO_NOT_PRINT', Artisan::output());
        config(['services.stripe.secret' => 'rk_live_DO_NOT_PRINT']);
        $this->assertTrue(app(LaunchReadiness::class)->read()['checks']['stripe_live_key']);
    }

    public function test_unowned_return_url_missing_annual_price_and_log_fallback_fail_closed(): void
    {
        $this->readyConfig();
        config(['services.stripe.success_url' => 'https://vibyra.app/billing/success',
            'membership.offers.pro_annual.stripe' => null, 'mail.default' => 'failover']);
        $result = app(LaunchReadiness::class)->read();
        $this->assertFalse($result['ready']);
        foreach (['stripe_success_url_owned', 'stripe_price_pro_annual_configured', 'mail_transport_configured'] as $key) {
            $this->assertFalse($result['checks'][$key]);
        }
    }

    private function readyConfig(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['app.debug' => false, 'app.url' => 'https://vibyra.net', 'mail.default' => 'resend',
            'mail.from.address' => 'support@vibyra.net', 'services.resend.key' => 'DO_NOT_PRINT',
            'legal.paid_sales_enabled' => true, 'membership.enabled' => true, 'membership.stripe_enabled' => true,
            'membership.stripe_environment' => 'live', 'services.stripe.secret' => 'sk_live_DO_NOT_PRINT',
            'services.stripe.webhook_secret' => 'whsec_DO_NOT_PRINT', 'membership.stripe_portal_configuration' => 'bpc_DO_NOT_PRINT',
            'membership.new_accounts_from' => now()->subDay()->toIso8601String()]);
        foreach (['success_url', 'cancel_url', 'portal_return_url'] as $key) config(['services.stripe.'.$key => 'https://vibyra.net/billing']);
        foreach (['pro_monthly', 'pro_annual', 'tokens_80', 'tokens_200', 'tokens_450'] as $offer) {
            config(['membership.offers.'.$offer.'.stripe' => 'price_DO_NOT_PRINT_'.$offer]);
        }
    }
}
