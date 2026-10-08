<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\{Allowances, Entitlements, PlanLimits, Trials, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, URL};
use Illuminate\Support\Str;
use Tests\TestCase;

class PlanLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.enabled' => true, 'membership.new_accounts_from' => now()->subYear()->toIso8601String(),
            'membership.trial_days' => 14, 'vibes.enabled' => true, 'agents.enabled' => true,
            'vibes.plan_limits_enabled' => true]);
    }

    private function account(bool $verified = true): User
    {
        return User::factory()->create(['email_verified_at' => $verified ? now() : null, 'plan' => 'free']);
    }

    private function paidPro(User $user): void
    {
        DB::table('membership_periods')->insert(['reference' => 'stripe:test:'.$user->id, 'user_id' => $user->id,
            'provider' => 'stripe', 'environment' => 'test', 'subscription_id' => 'sub_'.$user->id, 'offer_key' => 'pro_monthly',
            'starts_at' => now()->subDay(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999,
            'currency' => 'GBP', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function endTrial(User $user): void
    {
        DB::table('membership_periods')->where('user_id', $user->id)->where('provider', Trials::PROVIDER)
            ->update(['starts_at' => now()->subDays(15), 'ends_at' => now()->subDay()]);
    }

    private function signIn(User $user): void
    {
        $token = 'plan-limits-'.$user->id;
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Plan limits test']);
        $this->withToken($token);
    }

    public function test_free_has_two_terminals_and_no_worktrees_agents_or_cloud_while_pro_has_everything(): void
    {
        config(['membership.trial_days' => 0]);
        $free = $this->account();
        app(Wallet::class)->ensure($free);
        $this->assertSame(['version' => 1, 'enforced' => true, 'plan' => 'free', 'tier' => 'free', 'trial' => false, 'paidUntil' => null,
            'maxTerminals' => 2, 'maxProjects' => 1, 'safeWorktrees' => false, 'preview' => false, 'review' => false,
            'agents' => false, 'remoteAccess' => false], app(PlanLimits::class)->for($free));

        $pro = $this->account();
        app(Wallet::class)->ensure($pro);
        $this->paidPro($pro);
        $limits = app(PlanLimits::class)->for($pro);
        $this->assertSame([null, null, true, true, true, true, true, false], [$limits['maxTerminals'], $limits['maxProjects'],
            $limits['safeWorktrees'], $limits['preview'], $limits['review'], $limits['agents'], $limits['remoteAccess'], $limits['trial']]);
    }

    public function test_with_the_switch_off_every_plan_is_unlimited(): void
    {
        config(['vibes.plan_limits_enabled' => false, 'membership.trial_days' => 0]);
        $free = $this->account();
        $limits = app(PlanLimits::class)->for($free);
        $this->assertFalse($limits['enforced']);
        $this->assertSame([null, null, true, true, true, true], [$limits['maxTerminals'], $limits['maxProjects'],
            $limits['safeWorktrees'], $limits['preview'], $limits['review'], $limits['agents']]);
    }

    public function test_a_verified_new_account_gets_fourteen_days_of_pro_once(): void
    {
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->ensure($user);
        $this->assertSame(1, DB::table('membership_periods')->where('user_id', $user->id)->count());
        $m = app(Entitlements::class)->for($user);
        $this->assertSame(['pro', 'pro_v2', true], [$m['tier'], $m['plan'], $m['trial']]);
        $this->assertTrue(now()->addDays(14)->diffInMinutes($m['paidUntil'], true) < 2);
        $this->assertNull(app(PlanLimits::class)->for($user)['maxTerminals']);
        $this->assertSame(0, app(Wallet::class)->available($user->id), 'A trial grants no tokens.');

        $this->endTrial($user);
        $this->assertFalse(app(Trials::class)->start($user), 'An account only ever gets one trial.');
        $this->assertSame('free', app(Entitlements::class)->for($user)['tier']);
        $this->assertSame(2, app(PlanLimits::class)->for($user)['maxTerminals']);
    }

    public function test_the_trial_waits_for_email_verification_and_skips_accounts_that_have_paid(): void
    {
        $user = $this->account(verified: false);
        app(Wallet::class)->ensure($user);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $user->id)->count());
        $user->markEmailAsVerified();
        $this->assertTrue(app(Trials::class)->start($user));
        $this->assertTrue(app(Entitlements::class)->for($user)['trial']);

        config(['membership.trial_days' => 0]);
        $paid = $this->account();
        app(Wallet::class)->ensure($paid);
        $this->paidPro($paid);
        config(['membership.trial_days' => 14]);
        $this->assertFalse(app(Trials::class)->start($paid));
    }

    public function test_a_trial_is_not_a_subscription_so_it_can_be_upgraded_without_a_conflict(): void
    {
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->assertFalse(app(Entitlements::class)->subscribed($user));
        $this->paidPro($user);
        $m = app(Entitlements::class)->for($user);
        $this->assertSame(['stripe', false, false], [$m['provider'], $m['trial'], $m['conflict']]);
        $this->assertTrue(app(Entitlements::class)->subscribed($user));
    }

    public function test_agents_need_pro_on_the_server_but_stay_readable(): void
    {
        config(['membership.trial_days' => 0]);
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->signIn($user);
        $body = ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review code',
            'memory' => '', 'avatar' => 'review', 'budget' => 10, 'integrations' => []];
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('entitled', false);
        $this->postJson('/api/agents/v1/teammates', $body)->assertStatus(402)
            ->assertSee('Agents are part of Vibyra Pro');

        $this->paidPro($user);
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('entitled', true);
        $this->postJson('/api/agents/v1/teammates', $body)->assertOk();
    }

    public function test_the_session_carries_plan_limits_and_trial_state(): void
    {
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->signIn($user);
        $this->getJson('/api/session')->assertOk()
            ->assertJsonPath('user.planLimits.trial', true)->assertJsonPath('user.planLimits.maxTerminals', null)
            ->assertJsonPath('user.membershipTrial', true)->assertJsonPath('user.planLimits.enforced', true);
    }

    public function test_outdated_desktop_builds_are_asked_to_update_once_limits_are_on(): void
    {
        config(['vibes.min_desktop_version' => '0.8.0']);
        $this->withHeader('X-Vibyra-Desktop', '0.7.9')->getJson('/api/session')->assertStatus(426)
            ->assertJsonPath('updateRequired', true);
        $this->withHeader('X-Vibyra-Desktop', '0.8.0')->getJson('/api/session')->assertUnauthorized();
        $this->withHeaders(['X-Vibyra-Desktop' => ''])->getJson('/api/session')->assertUnauthorized();
        config(['vibes.plan_limits_enabled' => false]);
        $this->withHeader('X-Vibyra-Desktop', '0.1.0')->getJson('/api/session')->assertUnauthorized();
    }

    public function test_a_trial_account_still_receives_the_free_monthly_tokens(): void
    {
        config(['membership.free_enabled' => true, 'membership.free_tokens' => 30]);
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->assertTrue(app(Entitlements::class)->for($user)['trial']);
        app(Allowances::class)->refresh($user->id);
        $this->assertSame(30 * Units::SCALE, app(Wallet::class)->available($user->id), 'The trial must not leave a new account with no tokens.');
        $this->assertTrue(app(Wallet::class)->payload($user->id)['freeAllowance']['active']);
    }

    public function test_verifying_an_email_starts_the_trial_and_the_free_tokens(): void
    {
        config(['membership.free_enabled' => true, 'membership.free_tokens' => 30]);
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
        config(['membership.free_enabled' => true, 'membership.trial_days' => 0]);
        $paid = $this->account();
        app(Wallet::class)->ensure($paid);
        $this->paidPro($paid);
        app(Allowances::class)->refresh($paid->id);
        $this->assertNull(DB::table('vibes_wallets')->where('user_id', $paid->id)->value('free_enrolled_at'));
        $this->assertSame(0, (int) DB::table('membership_capacity')->where('key', 'free')->value('enrolled'));
        $this->assertFalse(app(Wallet::class)->payload($paid->id)['freeAllowance']['active']);
    }
}
