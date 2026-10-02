<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\Licenses\{Issuance, Keys};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Notification, URL};
use Illuminate\Support\Str;
use Tests\TestCase;

class LicenseIsolatedRolloutTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();
        config(['licenses.enabled' => true, 'membership.enabled' => false, 'membership.new_accounts_from' => null,
            'membership.free_enabled' => false, 'human_check.enabled' => false]);
        Notification::fake();
    }
    private function license(): array
    {
        return app(Issuance::class)->create(User::factory()->create(), ['request_id' => (string) Str::uuid(),
            'label' => 'Isolated rollout', 'tokens' => 300, 'allowance' => 'monthly', 'duration_months' => 1,
            'fixed_ends_at' => null, 'claim_by' => now()->addDay()]);
    }
    private function signup(string $email, array $extra = [], string $path = '/api/auth/signup'): User
    {
        $this->postJson($path, ['name' => 'License test', 'email' => $email, 'password' => 'only-test-password', ...$extra])->assertCreated();
        return User::where('email', $email)->firstOrFail();
    }
    private function verify(User $u): void
    {
        $route = collect(app('router')->getRoutes())->first(fn ($r) => str_contains($r->getActionName(), '@verifyEmail'));
        $this->get(URL::temporarySignedRoute($route->getName(), now()->addHour(), ['id' => $u->id, 'hash' => sha1($u->email)]))->assertOk();
    }
    public function test_email_and_website_signup_redeem_without_general_membership_rollout(): void
    {
        foreach (['/api/auth/signup', '/web-api/auth/signup'] as $i => $path) {
            $key = $this->license(); $u = $this->signup("licensed-$i@example.test", ['licenseKey' => $key['key']], $path);
            $this->assertDatabaseHas('vibes_wallets', ['user_id' => $u->id, 'billing_version' => 2]);
            $this->assertSame(0, app(Wallet::class)->available($u->id));
            $this->assertDatabaseMissing('membership_periods', ['user_id' => $u->id]);
            $this->verify($u);
            $this->assertDatabaseHas('membership_periods', ['user_id' => $u->id, 'provider' => 'license']);
            $this->assertSame(3000000, app(Wallet::class)->available($u->id));
        }
        $this->assertFalse(config('membership.enabled'));
    }
    public function test_ordinary_signup_and_spoofed_override_fields_do_not_enroll(): void
    {
        $u = $this->signup('ordinary@example.test', ['newAccount' => true, 'licenseSignup' => true]);
        $this->assertDatabaseMissing('vibes_wallets', ['user_id' => $u->id]);
        $this->assertSame((int) config('billing.plans.free.monthly_credits', 50), (int) $u->credits_balance);
        $bad = $this->signup('invalid@example.test', ['licenseKey' => 'invalid']); $this->verify($bad);
        $this->assertSame(0, app(Wallet::class)->available($bad->id));
        $this->assertDatabaseMissing('membership_periods', ['user_id' => $bad->id]);
    }
    public function test_existing_legacy_wallet_is_never_converted_by_redemption(): void
    {
        $u = User::factory()->create(['credits_balance' => 123]); app(Wallet::class)->ensure($u, 8);
        $key = $this->license();
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', 'rollout-test')]);
        $this->withToken('rollout-test')->postJson('/api/account/license', ['licenseKey' => $key['key'], 'newAccount' => true, 'licenseSignup' => true])->assertConflict();
        $this->assertDatabaseHas('vibes_wallets', ['user_id' => $u->id, 'billing_version' => 1]);
        $this->assertSame(123, (int) $u->fresh()->credits_balance);
        $this->assertSame(8, app(Wallet::class)->available($u->id));
        $this->assertDatabaseHas('membership_licenses', ['id' => $key['id'], 'redeemed_at' => null]);
    }
    public function test_license_wallet_is_initialized_before_referral_rewards(): void
    {
        $referrer = User::factory()->create(['referral_code' => 'LICENSETST']); $key = $this->license();
        $u = $this->signup('referral-license@example.test', ['licenseKey' => $key['key'], 'referralCode' => $referrer->referral_code]);
        $this->assertSame(0, (int) $u->credits_balance);
        $this->assertDatabaseMissing((new \App\Models\CreditLedger)->getTable(), ['user_id' => $u->id]);
        $this->assertDatabaseHas('referrals', ['referred_user_id' => $u->id]);
    }
}
