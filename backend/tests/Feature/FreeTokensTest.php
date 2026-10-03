<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Allowances, Entitlements, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, URL};
use Tests\TestCase;

class FreeTokensTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.enabled' => true, 'membership.new_accounts_from' => now()->subYear()->toIso8601String(),
            'membership.trial_days' => 14, 'membership.free_enabled' => true, 'membership.free_tokens' => 30,
            'vibes.enabled' => true]);
    }

    private function account(bool $verified = true): User
    {
        return User::factory()->create(['email_verified_at' => $verified ? now() : null, 'plan' => 'free']);
    }

    public function test_the_default_free_allowance_is_thirty_tokens(): void
    {
        $this->assertSame(30, (int) (require base_path('config/membership.php'))['free_tokens']);
    }

    public function test_a_trial_account_still_receives_the_free_monthly_tokens(): void
    {
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->assertTrue(app(Entitlements::class)->for($user)['trial']);
        app(Allowances::class)->refresh($user->id);
        $this->assertSame(30 * Units::SCALE, app(Wallet::class)->available($user->id), 'The trial must not leave a new account with no tokens.');
        $this->assertTrue(app(Wallet::class)->payload($user->id)['freeAllowance']['active']);
    }

    public function test_verifying_an_email_starts_the_trial_and_the_free_tokens(): void
    {
        $user = $this->account(verified: false);
        app(Wallet::class)->ensure($user);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $user->id)->count());
        $route = collect(app('router')->getRoutes())->first(fn ($r) => str_contains($r->getActionName(), '@verifyEmail'));
        $this->get(URL::temporarySignedRoute($route->getName(), now()->addHour(), ['id' => $user->id, 'hash' => sha1($user->email)]))->assertOk();
        $this->assertTrue(app(Entitlements::class)->for($user->fresh())['trial']);
        $this->assertSame(30 * Units::SCALE, app(Wallet::class)->available($user->id));
    }

    public function test_a_paying_subscriber_never_takes_a_free_pilot_seat(): void
    {
        config(['membership.trial_days' => 0]);
        $paid = $this->account();
        app(Wallet::class)->ensure($paid);
        DB::table('membership_periods')->insert(['reference' => 'stripe:test:'.$paid->id, 'user_id' => $paid->id,
            'provider' => 'stripe', 'environment' => 'test', 'subscription_id' => 'sub_'.$paid->id, 'offer_key' => 'pro_monthly',
            'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999,
            'currency' => 'GBP', 'created_at' => now(), 'updated_at' => now()]);
        app(Allowances::class)->refresh($paid->id);
        $this->assertNull(DB::table('vibes_wallets')->where('user_id', $paid->id)->value('free_enrolled_at'));
        $this->assertSame(0, (int) DB::table('membership_capacity')->where('key', 'free')->value('enrolled'));
        $this->assertFalse(app(Wallet::class)->payload($paid->id)['freeAllowance']['active']);
    }

    public function test_the_catalogue_publishes_the_free_allowance(): void
    {
        $this->getJson('/api/billing/catalogue')->assertOk()
            ->assertJsonPath('free.tokens', 30)->assertJsonPath('freePilotEnabled', true);
    }
}
