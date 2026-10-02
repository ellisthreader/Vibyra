<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\{Allowances, Enrollment, Entitlements, Periods, Units};
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class MembershipWalletTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    protected function setUp(): void
    {
        parent::setUp();
        config(['membership.free_enabled' => true, 'membership.free_accounts' => 2,
            'vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0);
        app(Enrollment::class)->migrate($this->user, 0);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'membership-test'), 'device_name' => 'test']);
        $this->withToken('membership-test');
        Queue::fake();
    }
    private function period(string $reference = 'stripe:live:invoice:one', ?int $userId = null): array
    {
        $p = ['reference' => $reference, 'provider' => 'stripe', 'environment' => 'live',
            'subscription_id' => 'sub_test', 'payment_id' => 'pi_test', 'offer_key' => 'pro_monthly',
            'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP'];
        app(Periods::class)->grant($userId ?? $this->user->id, $p);
        return $p;
    }
    public function test_legacy_admin_grant_rejects_accounts_eligible_for_new_enrollment(): void
    {
        config(['membership.enabled' => true, 'membership.new_accounts_from' => now()->subMinute()->toIso8601String()]);
        $new = User::factory()->create(['plan' => 'free', 'credits_balance' => 0, 'membership_ends_at' => null]);
        $this->artisan('vibyra:grant-vibes-plan', ['plan' => 'pro', '--email' => [$new->email]])
            ->expectsOutput('This legacy grant command cannot change membership v2 accounts.')
            ->assertExitCode(1);
        $this->assertDatabaseMissing('vibes_wallets', ['user_id' => $new->id]);
        $this->assertSame(0, (int) $new->fresh()->credits_balance);
    }
    private function turn(): object
    {
        app(Allowances::class)->refresh($this->user->id);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $this->user->id, 'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        $q = ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'test', 'text' => 'Hi', 'request' => [],
            'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => true, 'max' => 10000];
        return app(Turns::class)->submit($this->user->id, (string) Str::uuid(), $q);
    }
    public function test_free_grant_is_monthly_bounded_and_never_replayed(): void
    {
        $this->getJson('/api/billing/account?version=2')->assertOk()->assertJsonPath('wallet.availableUnits', '100000');
        $this->getJson('/api/vibes/wallet')->assertJsonPath('wallet.available', 10)->assertJsonPath('wallet.version', 2);
        $this->travel(4)->months();
        $w = app(Wallet::class)->payload($this->user->id);
        $this->assertEquals(10, $w['available']);
        $this->assertSame(2, DB::table('vibes_grants')->where('reference', 'like', 'free:%')->count());
    }
    public function test_fractional_settlement_releases_exact_hold_and_retry_is_idempotent(): void
    {
        $t = $this->turn();
        app(Turns::class)->settle($t->id, 123, 'Done');
        app(Turns::class)->settle($t->id, 9999, 'Duplicate');
        $w = app(Wallet::class)->payload($this->user->id);
        $this->assertSame('99877', $w['availableUnits']);
        $this->assertSame('0', $w['heldUnits']);
        $this->assertSame(123, DB::table('vibes_turns')->where('id', $t->id)->value('charged'));
        $this->assertEquals(123, DB::table('vibes_spend_days')->sum('spent'));
    }
    public function test_expired_promotion_cannot_be_resurrected_by_a_cancel(): void
    {
        $t = $this->turn();
        $this->travel(2)->months();
        app(Turns::class)->settle($t->id, 0, null);
        $this->assertSame(0, app(Wallet::class)->available($this->user->id));
    }
    public function test_pro_tokens_roll_over_and_survive_membership_expiry(): void
    {
        $this->period(); $this->period();
        $this->assertSame(1, DB::table('membership_periods')->count());
        $this->assertSame('pro_v2', app(Entitlements::class)->for($this->user)['plan']);
        $this->travel(2)->months();
        $this->assertSame('free', app(Entitlements::class)->for($this->user)['plan']);
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
    }
    public function test_refund_preserves_unrelated_topups_and_is_cumulative(): void
    {
        $p = $this->period();
        app(Wallet::class)->grant($this->user->id, 'unrelated', 'topup', 800000);
        app(Periods::class)->refund($p['reference'], 1000);
        app(Periods::class)->refund($p['reference'], 1000);
        $this->assertSame(3000000 + 800000 - intdiv(3000000 * 1000, 1999), app(Wallet::class)->available($this->user->id));
        $this->assertSame('pro_v2', app(Entitlements::class)->for($this->user)['plan']);
        app(Periods::class)->refund($p['reference'], 1999, true);
        $this->assertSame(800000, app(Wallet::class)->available($this->user->id));
        $this->assertSame('free', app(Entitlements::class)->for($this->user)['plan']);
    }
    public function test_legacy_dispatch_is_refused_before_a_provider_request(): void
    {
        Http::fake();
        foreach (['/api/chat', '/api/chat/stream', '/api/codex/responses', '/api/speech'] as $path) {
            $this->postJson($path, [])->assertStatus(409);
        }
        Http::assertNothingSent();
    }
    public function test_legacy_reset_job_does_not_replace_new_value(): void
    {
        $this->period();
        $this->user->forceFill(['plan_renews_at' => now()->subDay()])->save();
        $this->artisan('vibyra:refresh-credits')->assertSuccessful();
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
    }
    public function test_real_quote_uses_fractional_units_and_signed_scale(): void
    {
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools', 'max_tokens']]]]);
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Fractional'])->assertOk();
        $q = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Hi', 'model' => 'qwen/qwen3.8-flash'])->assertOk()->json();
        $this->assertLessThan(1, $q['maxCredits']);
        $decoded = app(Quotes::class)->decode($q['quote'], $this->user->id);
        $this->assertSame(10000, $decoded['unitScale']);
        $this->assertSame((string) $decoded['max'], $q['maximumUnits']);
    }
    public function test_free_capacity_exhaustion_does_not_block_paid_balance(): void
    {
        config(['membership.free_daily_micro_limit' => 0]);
        try { $this->turn(); $this->fail('Promotional-only work must respect capacity.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $this->assertSame(0, DB::table('vibes_turns')->count());
        $this->period();
        $turn = $this->turn();
        $this->assertSame('queued', $turn->status);
        app(Turns::class)->settle($turn->id, 123, 'Done');
        $this->assertSame(0, DB::table('vibes_spend_days')->value('free_held'));
    }

    public function test_expired_pro_keeps_project_history_and_allows_explicit_active_switch(): void
    {
        $this->period();
        $projects = app(\App\Services\Membership\Projects::class);
        $one = (object) ['host_id' => 'host', 'project_id' => 'one'];
        $two = (object) ['host_id' => 'host', 'project_id' => 'two'];
        $projects->activate($this->user->id, 'host', 'one');
        $projects->guard($this->user->id, $two); // Paid entitlement allows both.
        $this->travel(2)->months();
        $projects->guard($this->user->id, $one);
        try { $projects->guard($this->user->id, $two); $this->fail('Expired Pro must apply the Free active-project limit.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(402, $e->getStatusCode()); }
        $projects->activate($this->user->id, 'host', 'two');
        $projects->guard($this->user->id, $two);
        $this->assertSame('host/two', DB::table('vibes_wallets')->where('user_id', $this->user->id)->value('active_project_key'));
    }

    public function test_refund_waiting_for_a_hold_blocks_new_spend_until_reconciled(): void
    {
        $p = $this->period(); $turn = $this->turn();
        try { app(Periods::class)->refund($p['reference'], 1999); $this->fail('Pending hold must settle first.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        app(Turns::class)->settle($turn->id, 123, 'Done');
        try { $this->turn(); $this->fail('A refund must finish before new spending.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        app(Periods::class)->refund($p['reference'], 1999);
        $this->assertSame(1999, DB::table('membership_periods')->value('refunded_minor'));
    }

    public function test_tiny_license_balance_cannot_bypass_free_capacity_with_trial_allocations(): void
    {
        app(Allowances::class)->refresh($this->user->id);
        app(Wallet::class)->grant($this->user->id, 'license:tiny-test', 'license', 1);
        config(['membership.free_daily_micro_limit' => 0]);
        $before = app(Wallet::class)->available($this->user->id);
        try { $this->turn(); $this->fail('A tiny license grant must not bypass promotional capacity.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $this->assertSame($before, app(Wallet::class)->available($this->user->id));
        $this->assertSame(0, DB::table('vibes_turns')->count());
    }


}
