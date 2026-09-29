<?php

namespace Tests\Integration;

use App\Models\User;
use App\Services\Auth\{TwoFactor, TwoFactorChallenge};
use Illuminate\Support\Facades\{Cache, DB};
use Tests\TestCase;

/** Opt-in independent workers against an explicitly disposable local database. */
class TwoFactorPostgresConcurrencyTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers, \Tests\Support\TwoFactorFixture;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('REMOTE_POSTGRES_CONCURRENCY') !== '1'
            || ! str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_remote_security_')
            || ! in_array(getenv('DB_HOST'), ['/tmp', '127.0.0.1', 'localhost'], true)
            || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires an explicitly enabled disposable local PostgreSQL database and pcntl.');
        }
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertSame(getenv('DB_HOST'), DB::connection()->getConfig('host'));
        $this->assertEmpty(DB::connection()->getConfig('url'));
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['cache.default' => 'database']); Cache::purge();
    }

    public function test_concurrent_stale_callers_consume_each_totp_or_recovery_code_once(): void
    {
        [$user, $codes, $totp] = $this->protectedAccount();
        foreach ([$totp, $codes[0]] as $code) {
            $stale = $user->fresh();
            $claim = fn () => app(TwoFactor::class)->check($stale, $code);
            $result = $this->race([$claim, $claim]); sort($result);
            $this->assertSame([false, true], $result);
        }
        $this->assertCount(9, app(TwoFactor::class)->recoveryCodes($user->fresh()));
    }

    public function test_one_challenge_cannot_authorize_two_different_valid_codes_concurrently(): void
    {
        [$user, $codes] = $this->protectedAccount(); $service = app(TwoFactorChallenge::class);
        $id = $service->issue($user)['challengeId'];
        $result = $this->race([
            fn () => app(TwoFactorChallenge::class)->claim($id, $codes[0]) !== null,
            fn () => app(TwoFactorChallenge::class)->claim($id, $codes[1]) !== null,
        ]); sort($result);
        $this->assertSame([false, true], $result);
        $this->assertCount(9, app(TwoFactor::class)->recoveryCodes($user->fresh()));
    }

    public function test_concurrent_failed_attempts_cannot_restore_the_attempt_budget(): void
    {
        [$user, $codes] = $this->protectedAccount(); $service = app(TwoFactorChallenge::class);
        $id = $service->issue($user)['challengeId'];
        $wrong = fn () => app(TwoFactorChallenge::class)->claim($id, 'invalid') !== null;
        $this->assertSame(array_fill(0, 6, false), $this->race(array_fill(0, 6, $wrong)));
        $this->assertNull($service->claim($id, $codes[0]));
        $this->assertCount(10, app(TwoFactor::class)->recoveryCodes($user->fresh()));
    }

    public function test_code_replacement_racing_a_stale_login_never_restores_old_codes(): void
    {
        [$user, $codes] = $this->protectedAccount();
        $this->race([
            fn () => app(TwoFactor::class)->check($user, $codes[0]),
            fn () => DB::transaction(function () use ($user) {
                $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                app(TwoFactor::class)->replaceRecoveryCodes($locked);
                return true;
            }),
        ]);
        $current = app(TwoFactor::class)->recoveryCodes($user->fresh());
        $this->assertCount(10, $current);
        $this->assertSame([], array_intersect($codes, $current));
    }
}
