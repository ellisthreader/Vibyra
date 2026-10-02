<?php

namespace Tests\Integration;

use App\Models\User;
use App\Services\Membership\{Allowances, Periods};
use App\Services\Membership\Licenses\{Issuance, Keys, Redemption};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class LicensePostgresConcurrencyTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('LICENSE_POSTGRES_CONCURRENCY') !== '1'
            || !str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_license_qa_')
            || !in_array(getenv('DB_HOST'), ['127.0.0.1', 'localhost'], true) || !function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires explicit disposable local PostgreSQL and pcntl.');
        }
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertSame(getenv('DB_HOST'), DB::connection()->getConfig('host'));
        $this->assertEmpty(DB::connection()->getConfig('url'));
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['licenses.enabled' => true, 'membership.enabled' => true, 'membership.free_enabled' => false,
            'membership.new_accounts_from' => now()->subYear()->toIso8601String()]);
    }
    private function issue(): array
    {
        return app(Issuance::class)->create(User::factory()->create(), ['request_id' => (string) Str::uuid(),
            'label' => 'Race', 'tokens' => 300, 'allowance' => 'monthly', 'duration_months' => 3,
            'fixed_ends_at' => null, 'claim_by' => now()->addMonth()]);
    }
    private function claim(User $u, array $key): bool
    {
        try { app(Redemption::class)->redeem($u, Keys::hash($key['key'])); return true; }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if (!in_array($e->getStatusCode(), [409, 422])) throw $e;
            return false;
        }
    }
    public function test_two_accounts_one_key_and_two_keys_one_account(): void
    {
        $a = User::factory()->create(); $b = User::factory()->create(); $key = $this->issue();
        app(Wallet::class)->ensure($a); app(Wallet::class)->ensure($b);
        $results = $this->race([fn () => $this->claim($a, $key), fn () => $this->claim($b, $key)]);
        sort($results); $this->assertSame([false, true], $results);
        $this->assertSame(3000000, (int) DB::table('vibes_grants')->where('kind', 'license')->sum('remaining'));
        $c = User::factory()->create(); app(Wallet::class)->ensure($c); $one = $this->issue(); $two = $this->issue();
        $results = $this->race([fn () => $this->claim($c, $one), fn () => $this->claim($c, $two)]);
        sort($results); $this->assertSame([false, true], $results);
        $this->assertSame(3000000, app(Wallet::class)->available($c->id));
    }
    public function test_duplicate_claims_and_refreshes_grant_once(): void
    {
        $u = User::factory()->create(); app(Wallet::class)->ensure($u); $key = $this->issue();
        $claim = fn () => $this->claim($u, $key);
        $this->assertSame([true, true], $this->race([$claim, $claim]));
        $this->travel(1)->months();
        $refresh = function () use ($u) { app(Allowances::class)->refresh($u->id); return true; };
        $this->race([$refresh, $refresh]);
        $this->assertSame(2, DB::table('vibes_grants')->where('kind', 'license')->count());
        $this->assertSame(3000000, app(Wallet::class)->available($u->id));
    }
    public function test_revoke_racing_claim_and_refresh_never_leaves_spendable_grants(): void
    {
        $u = User::factory()->create(); $owner = User::factory()->create(); app(Wallet::class)->ensure($u); $key = $this->issue();
        $revoke = function () use ($key, $owner) { app(Issuance::class)->revoke($key['id'], $owner); return true; };
        $this->race([fn () => $this->claim($u, $key), $revoke]);
        $this->assertNotNull(DB::table('membership_licenses')->where('id', $key['id'])->value('revoked_at'));
        $this->assertSame(0, app(Wallet::class)->available($u->id));
        $key = $this->issue(); $this->claim($u, $key); $this->travel(1)->months();
        $this->race([
            function () use ($u) { app(Allowances::class)->refresh($u->id); return true; },
            function () use ($key, $owner) { app(Issuance::class)->revoke($key['id'], $owner); return true; },
        ]);
        $this->assertSame(0, app(Wallet::class)->available($u->id));
    }
    public function test_paid_activation_racing_redemption_preserves_paid_facts(): void
    {
        $u = User::factory()->create(); app(Wallet::class)->ensure($u); $key = $this->issue();
        $paid = function () use ($u) {
            app(Periods::class)->grant($u->id, ['reference' => 'stripe:race', 'provider' => 'stripe', 'environment' => 'live',
                'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(),
                'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
            return true;
        };
        $this->race([fn () => $this->claim($u, $key), $paid]);
        $this->assertDatabaseHas('membership_periods', ['reference' => 'stripe:race', 'user_id' => $u->id]);
        $this->assertSame('stripe', app(\App\Services\Membership\Entitlements::class)->for($u)['provider']);
        $this->assertContains(app(Wallet::class)->available($u->id), [3000000, 6000000]);
    }
}
