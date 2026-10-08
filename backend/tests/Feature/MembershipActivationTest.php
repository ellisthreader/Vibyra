<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Entitlements, PlanLimits};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Tests the coordinated launch configuration without converting existing customers. */
class MembershipActivationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 2)->setTime(16, 0));
        config(['legal.paid_sales_enabled' => true, 'membership.enabled' => true,
            'membership.stripe_enabled' => true, 'membership.free_enabled' => true,
            'membership.new_accounts_from' => now()->toIso8601String(),
            'membership.free_accounts' => 2000, 'vibes.plan_limits_enabled' => true,
            'membership.stripe_portal_configuration' => 'bpc_fixture',
            'services.stripe.secret' => 'rk_live_fixture', 'services.stripe.webhook_secret' => 'whsec_fixture']);
        foreach (array_keys(config('membership.offers')) as $key) config(["membership.offers.$key.stripe" => 'price_'.$key]);
    }

    public function test_new_verified_account_gets_published_free_terms_once_without_an_invented_pro_trial(): void
    {
        $u = User::factory()->create(['plan' => 'free', 'credits_balance' => 0, 'email_verified_at' => null]);
        $wallet = app(Wallet::class);
        $this->assertSame(2, (int) $wallet->ensure($u)->billing_version);
        $this->assertSame('0', $wallet->payload($u->id)['availableUnits']);
        $u->forceFill(['email_verified_at' => now()])->save();
        $first = $wallet->payload($u->id);$second = $wallet->payload($u->id);
        $this->assertSame('300000', $first['availableUnits']);
        $this->assertSame($first['availableUnits'], $second['availableUnits']);
        $this->assertTrue($first['freeAllowance']['eligible']);
        $this->assertSame(30, $first['freeAllowance']['tokens']);
        $this->assertTrue($first['salesCapabilities']['stripe']);
        $this->assertSame('free', $first['membership']['tier']);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $u->id)->count());
        $limits = app(PlanLimits::class)->for($u);
        $this->assertTrue($limits['enforced']);
        $this->assertSame(2, $limits['maxTerminals']);
        $this->assertSame(1, $limits['maxProjects']);
        $this->assertFalse($limits['preview']);$this->assertFalse($limits['review']);
        $this->assertFalse($limits['safeWorktrees']);
    }

    public function test_launch_cutoff_preserves_existing_wallet_and_active_legacy_membership(): void
    {
        $u = User::factory()->create(['plan' => 'builder', 'billing_provider' => 'stripe',
            'membership_ends_at' => now()->addDays(20), 'credits_balance' => 57, 'created_at' => now()->subMonth()]);
        $wallet = app(Wallet::class);$wallet->ensure($u, 11);
        $before = DB::table('vibes_grants')->where('user_id', $u->id)->get()->toJson();
        $this->assertSame(1, (int) $wallet->ensure($u)->billing_version);
        $this->assertSame($before, DB::table('vibes_grants')->where('user_id', $u->id)->get()->toJson());
        $this->assertSame(57, (int) $u->fresh()->credits_balance);
        $this->assertSame('builder', app(Entitlements::class)->for($u)['plan']);
        $limits = app(PlanLimits::class)->for($u);
        $this->assertNull($limits['maxTerminals']);$this->assertNull($limits['maxProjects']);
        $this->assertTrue($limits['preview']);$this->assertTrue($limits['review']);
        $oldFree = User::factory()->create(['plan' => 'free', 'created_at' => now()->subSecond()]);
        $this->assertSame(1, (int) $wallet->ensure($oldFree)->billing_version);
    }

    public function test_public_catalogue_admits_five_exact_offers_and_rollback_closes_them(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $offers = $this->getJson('/api/billing/catalogue')->assertOk()->json('offers');
        $this->assertCount(5, $offers);
        $expected = ['pro_monthly' => [1999, 300, 'month'], 'pro_annual' => [19999, 3600, 'year'],
            'tokens_80' => [499, 80, null], 'tokens_200' => [999, 200, null], 'tokens_450' => [1999, 450, null]];
        foreach ($offers as $o) {
            $this->assertSame($expected[$o['offerKey']], [$o['pence'], $o['credits'], $o['interval']]);
            $this->assertTrue($o['stripeEnabled']);$this->assertFalse($o['appleEnabled']);
        }
        config(['legal.paid_sales_enabled' => false]);
        foreach ($this->getJson('/api/billing/catalogue')->assertOk()->json('offers') as $o) $this->assertFalse($o['stripeEnabled']);
    }

    public function test_new_verified_account_gets_published_free_terms_once_with_pro_trial_explicitly_disabled(): void
    {
        $u = User::factory()->create(['plan' => 'free', 'credits_balance' => 0, 'email_verified_at' => null]);
        $wallet = app(Wallet::class);
        $this->assertSame(2, (int) $wallet->ensure($u)->billing_version);
        $this->assertSame('0', $wallet->payload($u->id)['availableUnits']);
        $u->forceFill(['email_verified_at' => now()])->save();
        $first = $wallet->payload($u->id);$second = $wallet->payload($u->id);
        $this->assertSame('300000', $first['availableUnits']);
        $this->assertSame($first['availableUnits'], $second['availableUnits']);
        $this->assertTrue($first['freeAllowance']['eligible']);
        $this->assertSame(30, $first['freeAllowance']['tokens']);
        $this->assertTrue($first['salesCapabilities']['stripe']);
        $this->assertSame('free', $first['membership']['tier']);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $u->id)->count());
        $limits = app(PlanLimits::class)->for($u);
        $this->assertTrue($limits['enforced']);
        $this->assertSame(2, $limits['maxTerminals']);
        $this->assertSame(1, $limits['maxProjects']);
        $this->assertFalse($limits['preview']);$this->assertFalse($limits['review']);
        $this->assertFalse($limits['safeWorktrees']);
    }

}
