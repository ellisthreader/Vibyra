<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\{Enrollment, Entitlements, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GrantMembershipCommandTest extends TestCase
{
    use RefreshDatabase;

    private function modern(): User
    {
        $u = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($u, 0);
        app(Enrollment::class)->migrate($u, 0);
        return $u;
    }

    public function test_unknown_email_fails_and_writes_nothing(): void
    {
        $this->artisan('vibyra:grant-membership', ['email' => 'nobody@example.com'])->expectsOutput('No account with that email.')->assertExitCode(1);
        $this->assertSame(0, DB::table('membership_periods')->count());
    }

    public function test_dry_run_reports_and_writes_nothing(): void
    {
        $u = $this->modern();
        $this->artisan('vibyra:grant-membership', ['email' => strtoupper($u->email), '--dry-run' => true])->expectsOutputToContain('USER_ID='.$u->id)->assertExitCode(0);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $u->id)->where('provider', 'complimentary')->count());
        $this->assertSame('free', app(Entitlements::class)->for($u)['tier']);
    }

    public function test_grant_makes_a_labelled_pro_period_with_tokens_and_an_audit_row_once(): void
    {
        $u = $this->modern();
        $this->artisan('vibyra:grant-membership', ['email' => $u->email, '--days' => 365, '--note' => 'owner'])->assertExitCode(0);
        $p = DB::table('membership_periods')->where('user_id', $u->id)->where('provider', 'complimentary')->first();
        $this->assertNotNull($p);
        $this->assertNull($p->subscription_id);
        $this->assertNull($p->payment_id);
        $this->assertSame(0, (int) $p->paid_minor);
        $this->assertSame(36000000, (int) $p->units);
        $e = app(Entitlements::class)->for($u);
        $this->assertSame('pro_v2', $e['plan']);
        $this->assertSame('complimentary', $e['provider']);
        $this->assertSame(36000000, (int) DB::table('vibes_grants')->where('reference', $p->reference)->value('remaining'));
        $audit = DB::table('membership_events')->where('type', 'complimentary.grant')->first();
        $this->assertSame('owner', json_decode($audit->payload, true)['note']);
        // A second run (or a retry) never grants again.
        $this->artisan('vibyra:grant-membership', ['email' => $u->email])->assertExitCode(0);
        $this->assertSame(1, DB::table('membership_periods')->where('user_id', $u->id)->where('provider', 'complimentary')->count());
        $this->assertSame(1, DB::table('membership_events')->where('type', 'complimentary.grant')->count());
    }

    public function test_an_active_paid_membership_is_never_overlaid(): void
    {
        $u = $this->modern();
        app(Periods::class)->grant($u->id, ['reference' => 'stripe:live:invoice:x', 'provider' => 'stripe', 'environment' => 'live', 'subscription_id' => 'sub_x',
            'payment_id' => 'pi_x', 'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        $this->artisan('vibyra:grant-membership', ['email' => $u->email])->assertExitCode(1);
        $this->assertSame(0, DB::table('membership_periods')->where('provider', 'complimentary')->count());
    }

    public function test_a_legacy_wallet_needs_the_explicit_flag(): void
    {
        $u = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($u, 0);
        $this->artisan('vibyra:grant-membership', ['email' => $u->email])->assertExitCode(1);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $u->id)->count());
        $this->artisan('vibyra:grant-membership', ['email' => $u->email, '--migrate-legacy-wallet' => true])->assertExitCode(0);
        $this->assertSame('pro_v2', app(Entitlements::class)->for($u)['plan']);
    }

    public function test_it_is_not_reachable_over_http(): void
    {
        $this->assertNull(collect(\Illuminate\Support\Facades\Route::getRoutes()->getRoutes())->first(fn ($r) => str_contains($r->uri(), 'grant-membership')));
    }

    public function test_options_are_bounded(): void
    {
        $u = $this->modern();
        $this->artisan('vibyra:grant-membership', ['email' => $u->email, '--days' => 5000])->assertExitCode(1);
        $this->artisan('vibyra:grant-membership', ['email' => $u->email, '--tokens' => 999999])->assertExitCode(1);
    }
}
