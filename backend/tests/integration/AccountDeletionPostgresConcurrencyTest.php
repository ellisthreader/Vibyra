<?php
namespace Tests\Integration;

use App\Models\User;
use App\Services\Account\{AccountDeletion, StripeSubscriptionCancellation};
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\{DB, Http, Queue, Schema, Storage};
use Tests\TestCase;

/** Real independent workers, synthetic identities, fake provider calls, explicit disposable database. */
class AccountDeletionPostgresConcurrencyTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('REMOTE_POSTGRES_CONCURRENCY') !== '1'
            || !str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_remote_security_')
            || getenv('DB_HOST') !== '127.0.0.1' || !function_exists('pcntl_fork'))
            $this->markTestSkipped('Requires explicitly enabled disposable local PostgreSQL and pcntl.');
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertEmpty(DB::connection()->getConfig('url'));
        DB::statement('DROP SCHEMA public CASCADE'); DB::statement('CREATE SCHEMA public');
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        Schema::create('qa_cancel_calls', function ($t) { $t->id(); $t->string('subscription'); });
        Queue::fake(); Http::preventStrayRequests();
        Storage::fake('deletion-fixture'); Storage::fake('local'); Storage::fake('cloud-sync');
        config(['vibes.attachments_disk' => 'deletion-fixture']);
        $this->app->instance(StripeSubscriptionCancellation::class, new class extends StripeSubscriptionCancellation {
            public function cancel(string $id): void
            {
                DB::table('qa_cancel_calls')->insert(['subscription' => $id]);
                usleep(30000);
                if ($id === 'sub_retry' && DB::table('qa_cancel_calls')->where('subscription', $id)->count() === 1)
                    throw new \RuntimeException('Synthetic first provider failure');
            }
        });
    }

    private function cleanup(array $subscriptions): int
    {
        $user = User::factory()->create(); $id = $user->id; $user->delete();
        DB::table('account_deletion_cleanups')->insert(['user_id' => $id, 'disk' => 'deletion-fixture',
            'attachment_directory' => 'vibes-attachments/'.$id, 'stripe_subscription_ids' => json_encode($subscriptions),
            'status' => 'pending', 'next_attempt_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }

    public function test_parallel_cleaners_cancel_once_and_cannot_overwrite_completion(): void
    {
        $id = $this->cleanup(['sub_once']);
        $clean = fn () => app(AccountDeletion::class)->cleanPending($id);
        $this->assertSame([true, true], $this->race([$clean, $clean]));
        $this->assertSame(1, DB::table('qa_cancel_calls')->count());
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $id, 'status' => 'complete', 'attempts' => 1]);
    }

    public function test_parallel_retry_preserves_successful_subscription_progress(): void
    {
        $id = $this->cleanup(['sub_retry', 'sub_once']);
        $clean = fn () => app(AccountDeletion::class)->cleanPending($id);
        $result = $this->race([$clean, $clean]); sort($result);
        $this->assertSame([false, true], $result);
        $this->assertSame(2, DB::table('qa_cancel_calls')->where('subscription', 'sub_retry')->count());
        $this->assertSame(1, DB::table('qa_cancel_calls')->where('subscription', 'sub_once')->count());
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $id, 'status' => 'complete', 'attempts' => 2]);
    }

    public function test_simultaneous_account_deletion_keeps_one_cleanup_and_cancels_once(): void
    {
        $user = User::factory()->create(['stripe_subscription_id' => 'sub_once']);
        DB::table('membership_owners')->insert(['reference' => 'qa-retained-payment', 'user_id' => $user->id]);
        $delete = function () use ($user) {
            try { return app(AccountDeletion::class)->delete($user) ? 'deleted' : 'pending'; }
            catch (ModelNotFoundException) { return 'already_deleted'; }
        };
        $result = $this->race([$delete, $delete]); sort($result);
        $this->assertSame(['already_deleted', 'deleted'], $result);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseHas('membership_owners', ['reference' => 'qa-retained-payment', 'user_id' => null]);
        $this->assertSame(1, DB::table('account_deletion_cleanups')->count());
        $this->assertSame(1, DB::table('qa_cancel_calls')->count());
    }
}
