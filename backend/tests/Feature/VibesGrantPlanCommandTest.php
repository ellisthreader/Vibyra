<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Billing\MembershipEntitlement;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

/** A hand-granted plan must look exactly like a bought one, and never double-grant. */
class VibesGrantPlanCommandTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
        config(['vibes.enabled' => true]);
    }

    public function test_all_accounts_get_the_plan_its_credits_and_an_active_membership(): void
    {
        $a = User::factory()->create(['email' => 'a@example.com']);
        $b = User::factory()->create(['email' => 'b@example.com']);

        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--all' => true])->assertSuccessful();
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--all' => true])->assertSuccessful();

        foreach ([$a, $b] as $user) {
            $this->assertSame('pro', app(Wallet::class)->planFor($user->id));
            $this->assertTrue(app(MembershipEntitlement::class)->active($user->fresh()));
            $this->assertSame(1, DB::table('vibes_grants')->where('user_id', $user->id)->where('kind', 'subscription')->count());
            $this->assertSame(2000, (int) DB::table('vibes_grants')->where('user_id', $user->id)->where('kind', 'subscription')->value('remaining'));
        }
    }

    public function test_email_targets_one_account_and_free_clears_the_period(): void
    {
        $a = User::factory()->create(['email' => 'a@example.com']);
        $b = User::factory()->create(['email' => 'b@example.com']);

        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'builder', '--email' => ['A@example.com']])->assertSuccessful();
        $this->assertSame('builder', app(Wallet::class)->planFor($a->id));
        $this->assertSame('free', app(Wallet::class)->planFor($b->id));

        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'free', '--email' => ['a@example.com']])->assertSuccessful();
        $this->assertSame('free', app(Wallet::class)->planFor($a->id));
        $this->assertNull(DB::table('vibes_wallets')->where('user_id', $a->id)->value('paid_until'));
    }

    public function test_verify_email_only_when_asked(): void
    {
        $a = User::factory()->create(['email' => 'a@example.com', 'email_verified_at' => null]);
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--all' => true])->assertSuccessful();
        $this->assertNull($a->fresh()->email_verified_at);
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--all' => true, '--verify-email' => true])->assertSuccessful();
        $this->assertNotNull($a->fresh()->email_verified_at);
    }

    public function test_unknown_account_or_plan_fails_before_writing(): void
    {
        User::factory()->create(['email' => 'a@example.com']);
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--email' => ['nobody@example.com']])->assertFailed();
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'gold', '--all' => true])->assertFailed();
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro'])->assertFailed();
        $this->assertSame(0, DB::table('vibes_wallets')->count());
    }
}
