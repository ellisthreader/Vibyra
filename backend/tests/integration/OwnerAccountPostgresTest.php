<?php

namespace Tests\Integration;

use App\Models\VibyraSession;
use App\Services\Account\AccountAccess;
use App\Services\Owner\{AccountActions, AccountProfile, ActionCancellation};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OwnerAccountPostgresTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers, \Tests\Feature\Concerns\OwnerAccountFixtures;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('OWNER_POSTGRES_QA') !== '1'
            || !str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_owner_qa_')
            || !in_array(getenv('DB_HOST'), ['127.0.0.1', 'localhost'], true) || !function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires explicit disposable local PostgreSQL and pcntl.');
        }
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertSame(getenv('DB_HOST'), DB::connection()->getConfig('host'));
        $this->assertEmpty(DB::connection()->getConfig('url'));
        // migrate:fresh leaves PostgreSQL trigger functions behind; this database is disposable.
        DB::statement('DROP SCHEMA public CASCADE');
        DB::statement('CREATE SCHEMA public');
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        $this->accounts(); $this->unlockOwner();
    }

    private function apply(array $terms): array
    {
        try {
            return app(AccountActions::class)->apply($this->owner->id, $this->target->id,
                [...$terms, 'message' => null], now()->timestamp);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if ($e->getStatusCode() !== 409) throw $e;
            return ['conflict' => true];
        }
    }

    public function test_concurrent_duplicate_token_grants_commit_once_and_different_stale_actions_conflict(): void
    {
        app(Wallet::class)->ensure($this->target, 0);
        DB::table('vibes_wallets')->where('user_id', $this->target->id)->update(['billing_version' => 2]);
        $terms = $this->action(['balance' => 'tokens']);
        $results = $this->race([fn () => $this->apply($terms), fn () => $this->apply($terms)]);
        $this->assertSame($results[0], $results[1]);
        $this->assertSame(250000, app(Wallet::class)->available($this->target->id));
        $this->assertDatabaseCount('owner_account_actions', 1);
        $a = $this->action(['balance' => 'tokens', 'revision' => 1]);
        $b = $this->action(['balance' => 'tokens', 'revision' => 1]);
        $results = $this->race([fn () => $this->apply($a), fn () => $this->apply($b)]);
        $this->assertCount(1, array_filter($results, fn ($row) => !empty($row['conflict'])));
        $this->assertSame(500000, app(Wallet::class)->available($this->target->id));
    }

    public function test_cancellation_and_late_submission_have_one_durable_outcome(): void
    {
        $terms = $this->action();
        $this->race([fn () => $this->apply($terms), fn () => app(ActionCancellation::class)->cancel(
            $this->owner->id, $this->target->id, $terms['request_id'], now()->timestamp)]);
        $row = DB::table('owner_account_actions')->first();
        $this->assertDatabaseCount('owner_account_actions', 1);
        $this->assertSame($row->action === 'credit' ? 45 : 20, (int) $this->target->fresh()->credits_balance);
        $again = $this->apply($terms);
        $this->assertSame($row->action === 'cancelled', isset($again['conflict']));
        $this->assertSame($row->action === 'credit' ? 45 : 20, (int) $this->target->fresh()->credits_balance);
    }

    public function test_profile_never_combines_a_new_revision_with_an_old_legacy_balance(): void
    {
        $terms = $this->action();
        $results = $this->race([fn () => $this->apply($terms), function () {
            $snapshots = [];
            for ($i = 0; $i < 20; $i++) {
                $p = app(AccountProfile::class)->for($this->target, $this->owner->id);
                $snapshots[] = [(int) $p['account']->owner_action_revision, $p['balances'][0]['available']];
            }
            return $snapshots;
        }]);
        foreach ($results[1] as $snapshot) $this->assertContains($snapshot, [[0, '20'], [1, '45']]);
    }

    public function test_profile_stays_in_one_currency_while_legacy_wallet_is_migrated(): void
    {
        app(Wallet::class)->ensure($this->target, 0);
        app(Wallet::class)->grant($this->target->id, 'fixture-legacy', 'owner', 3);
        $results = $this->race([function () {
            app(\App\Services\Membership\Enrollment::class)->migrate($this->target, 20); return true;
        }, function () {
            $snapshots = [];
            for ($i = 0; $i < 20; $i++) {
                $p = app(AccountProfile::class)->for($this->target, $this->owner->id);
                $snapshots[] = [$p['balances'][0]['scale'], $p['balances'][0]['available']];
            }
            return $snapshots;
        }]);
        foreach ($results[1] as $snapshot) $this->assertContains($snapshot, [[1, '3'], [10000, '230000']]);
    }

    public function test_a_native_session_cannot_escape_a_concurrent_ban(): void
    {
        $terms = $this->action(['action' => 'ban']);
        $this->race([fn () => $this->apply($terms), function () {
            try {
                AccountAccess::withActive($this->target->id, fn () => VibyraSession::create([
                    'user_id' => $this->target->id, 'token_hash' => hash('sha256', 'race-session')]));
                return true;
            } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
                if ($e->getResponse()->getStatusCode() !== 403) throw $e; return false;
            }
        }]);
        $this->assertFalse(AccountAccess::allowed($this->target->id));
        $this->assertSame(0, VibyraSession::where('user_id', $this->target->id)->whereNull('revoked_at')->count());
    }
}
