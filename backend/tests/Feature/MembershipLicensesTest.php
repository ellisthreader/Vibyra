<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\{Allowances, Entitlements, Periods};
use App\Services\Membership\Licenses\{Issuance, Keys, Redemption};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Notification, URL};
use Illuminate\Support\Str;
use Tests\TestCase;

class MembershipLicensesTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();
        config(['licenses.enabled' => true, 'membership.enabled' => true,
            'membership.new_accounts_from' => now()->subYear()->toIso8601String(),
            'membership.free_enabled' => false, 'human_check.enabled' => false]);
        Notification::fake();
    }
    private function issue(array $terms = []): array
    {
        return app(Issuance::class)->create(User::factory()->create(), [...[
            'request_id' => (string) Str::uuid(), 'label' => 'Test grant', 'tokens' => 300, 'allowance' => 'monthly',
            'duration_months' => 3, 'fixed_ends_at' => null, 'claim_by' => now()->addMonth()->format('Y-m-d H:i:s'),
        ], ...$terms]);
    }
    private function redeem(User $u, array $key): array
    {
        return app(Redemption::class)->redeem($u, Keys::hash($key['key']));
    }
    private function token(User $u): void
    {
        VibyraSession::where('user_id', $u->id)->delete();
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', 'license-test'), 'device_name' => 'test']);
        $this->withToken('license-test');
    }
    public function test_single_use_atomic_grants_and_same_account_retry(): void
    {
        $u = User::factory()->create(); $key = $this->issue(); $this->token($u);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertOk()->assertJsonPath('user.billingProvider', 'license');
        $this->postJson('/api/account/license', ['licenseKey' => strtolower($key['key'])])->assertOk();
        $this->assertSame(3000000, app(Wallet::class)->available($u->id));
        $this->assertDatabaseCount('membership_licenses', 1);
        $this->assertDatabaseHas('membership_periods', ['user_id' => $u->id, 'provider' => 'license']);
        $this->assertFalse(app(Entitlements::class)->subscribed($u));
        $other = User::factory()->create();
        try { $this->redeem($other, $key); $this->fail('Key must be single use'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        $this->assertDatabaseMissing('membership_periods', ['user_id' => $other->id, 'provider' => 'license']);
    }
    public function test_month_anniversaries_skip_missed_months_and_expire(): void
    {
        $this->travelTo(now()->setDate(2026, 1, 31)->setTime(12, 0));
        $u = User::factory()->create(); $key = $this->issue(); $this->redeem($u, $key);
        $this->travelTo(now()->setDate(2026, 2, 28));
        app(Allowances::class)->refresh($u->id);
        $this->assertSame(3000000, app(Wallet::class)->available($u->id));
        $this->assertSame(2, DB::table('vibes_grants')->where('kind', 'license')->count());
        $this->travelTo(now()->setDate(2026, 4, 2));
        app(Allowances::class)->refresh($u->id);
        $this->assertSame(3000000, app(Wallet::class)->available($u->id));
        $this->travelTo(now()->setDate(2026, 4, 30));
        app(Allowances::class)->refresh($u->id);
        $this->assertSame(0, app(Wallet::class)->available($u->id));
        $this->assertSame('free', app(Entitlements::class)->for($u)['tier']);
    }
    public function test_revocation_preserves_purchased_grant_and_feature_disable_does_not_stop_expiry(): void
    {
        $u = User::factory()->create(); $key = $this->issue(['allowance' => 'once']); $this->redeem($u, $key);
        app(Wallet::class)->grant($u->id, 'purchased-test', 'topup', 800000);
        config(['licenses.enabled' => false]);
        app(Issuance::class)->revoke($key['id'], User::factory()->create());
        app(Issuance::class)->revoke($key['id'], User::factory()->create());
        $this->assertSame(800000, app(Wallet::class)->available($u->id));
        $this->assertSame('free', app(Entitlements::class)->for($u)['tier']);
        $this->assertSame(1, DB::table('membership_license_audits')->where('event', 'revoked')->count());
    }
    public function test_signup_retains_only_hash_and_verification_automatically_redeems(): void
    {
        $key = $this->issue();
        $this->postJson('/api/auth/signup', ['name' => 'License User', 'email' => 'license@example.test',
            'password' => 'test-password-only', 'licenseKey' => $key['key']])->assertCreated()
            ->assertJsonPath('user.licenseRedemptionStatus', 'pending_verification');
        $u = User::where('email', 'license@example.test')->firstOrFail();
        $this->assertDatabaseHas('membership_license_claims', ['user_id' => $u->id, 'key_hash' => Keys::hash($key['key'])]);
        $this->assertDatabaseHas('membership_licenses', ['id' => $key['id'], 'redeemed_at' => null]);
        $route = collect(app('router')->getRoutes())->first(fn ($r) => str_contains($r->getActionName(), '@verifyEmail'));
        $url = URL::temporarySignedRoute($route->getName(), now()->addHour(), ['id' => $u->id, 'hash' => sha1($u->email)]);
        $this->get($url)->assertOk();
        $this->assertDatabaseHas('membership_license_claims', ['user_id' => $u->id, 'key_hash' => null, 'status' => 'redeemed']);
        $this->assertSame('license', app(Entitlements::class)->for($u->fresh())['provider']);
    }
    public function test_paid_and_pending_checkout_conflicts_do_not_consume_key(): void
    {
        $u = User::factory()->create(); app(Wallet::class)->ensure($u); $key = $this->issue(); $this->token($u);
        DB::table('membership_orders')->insert(['id' => (string) Str::uuid(), 'user_id' => $u->id,
            'offer_key' => 'pro_monthly', 'offer_version' => 'test', 'price_id' => 'price_test', 'customer_id' => 'cus_test',
            'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertConflict();
        DB::table('membership_orders')->where('user_id', $u->id)->update(['expires_at' => now()->subSecond()]);
        app(Periods::class)->grant($u->id, ['reference' => 'paid-test', 'provider' => 'stripe', 'environment' => 'live',
            'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertConflict();
        $this->assertDatabaseHas('membership_licenses', ['id' => $key['id'], 'redeemed_at' => null]);
    }
    public function test_zero_token_fixed_license_ends_trial_and_invalid_keys_do_not_block_signup(): void
    {
        $u = User::factory()->create();
        $key = $this->issue(['tokens' => 0, 'duration_months' => null, 'fixed_ends_at' => now()->addDay()]);
        $this->redeem($u, $key); $this->travel(2)->days();
        $this->assertSame('free', app(Entitlements::class)->for($u)['tier']);
        $this->postJson('/api/auth/signup', ['email' => 'bad-key@example.test', 'password' => 'test-password-only', 'licenseKey' => 'invalid'])
            ->assertCreated()->assertJsonPath('user.licenseRedemptionStatus', 'pending_verification');
    }

    public function test_paid_membership_controls_remain_visible_and_license_tokens_are_not_nonexpiring_paid_tokens(): void
    {
        $u = User::factory()->create(['stripe_customer_id' => 'cus_fixture']);
        $this->redeem($u, $this->issue());
        $this->assertSame(0, app(Wallet::class)->payload($u->id)['paidAvailable']);
        app(Periods::class)->grant($u->id, ['reference' => 'stripe:shorter', 'provider' => 'stripe', 'environment' => 'live',
            'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        $projection = app(\App\Services\Vibes\AccountMembership::class)->for($u);
        $this->assertSame('stripe', $projection['billingProvider']);
        $this->assertTrue($projection['canManageStripeBilling']);
        $this->travel(1)->months();
        $this->assertSame('license', app(Entitlements::class)->for($u)['provider']);
    }
    public function test_unverified_invalid_and_expired_claims_never_receive_tokens(): void
    {
        $u = User::factory()->unverified()->create(); $key = $this->issue(); $this->token($u);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertForbidden();
        $this->assertDatabaseHas('membership_licenses', ['id' => $key['id'], 'redeemed_at' => null]);
        $u->markEmailAsVerified();
        $this->postJson('/api/account/license', ['licenseKey' => 'invalid'])->assertUnprocessable();
        $this->travel(2)->months(); $this->token($u);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertUnprocessable();
        $this->assertDatabaseMissing('membership_periods', ['user_id' => $u->id, 'provider' => 'license']);
    }

    public function test_expired_and_revoked_same_account_retries_cannot_restore_grants(): void
    {
        $u = User::factory()->create(); $key = $this->issue(['duration_months' => 1]); $this->token($u);
        $this->redeem($u, $key); $this->travel(2)->months(); $this->token($u);
        $this->postJson('/api/account/license', ['licenseKey' => $key['key']])->assertUnprocessable();
        app(Allowances::class)->refresh($u->id);
        $this->assertSame(0, app(Wallet::class)->available($u->id));
        $replacement = $this->issue(); $this->redeem($u, $replacement);
        app(Issuance::class)->revoke($replacement['id'], User::factory()->create());
        $this->postJson('/api/account/license', ['licenseKey' => $replacement['key']])->assertUnprocessable();
        $this->assertSame(0, app(Wallet::class)->available($u->id));
    }

}
