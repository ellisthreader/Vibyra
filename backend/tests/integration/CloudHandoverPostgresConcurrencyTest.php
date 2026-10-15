<?php
namespace Tests\Integration;

use App\Models\{User, VibyraSession};
use App\Services\CloudComputer\{AccessProjects, ConnectAgreement, ConnectConsent, ConnectSelections, SyncLogins};
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Http, Queue, Storage};
use Tests\TestCase;

/** Real account/row locks, committed fixtures and independent processes, on an explicitly isolated local database. */
class CloudHandoverPostgresConcurrencyTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers;

    private User $user;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('CLOUD_CONNECT_POSTGRES_CONCURRENCY') !== '1'
            || !str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_cloud_connect_')
            || !in_array(getenv('DB_HOST'), ['127.0.0.1', 'localhost'], true) || !function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires an explicitly enabled disposable local PostgreSQL database and pcntl.');
        }
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertEmpty(DB::connection()->getConfig('url'));
        // migrate:fresh leaves PostgreSQL trigger functions behind; reset only this guarded disposable schema.
        DB::statement('DROP SCHEMA public CASCADE');
        DB::statement('CREATE SCHEMA public');
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
        config(['cloud_workspaces.enabled' => true, 'cloud_workspaces.starts_enabled' => false,
            'cloud_workspaces.daily_micro_limit' => 100000000, 'cloud_workspaces.provider_audit_required' => false,
            'cloud_workspaces.sync_disk' => 'cloud-sync', 'vibes.enabled' => true]);
        Queue::fake(); Http::preventStrayRequests(); Storage::fake('cloud-sync');
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0); app(Enrollment::class)->migrate($this->user, 0);
        app(Periods::class)->grant($this->user->id, ['reference' => 'cloud-connect:fixture', 'provider' => 'stripe', 'environment' => 'test',
            'subscription_id' => 'sub', 'payment_id' => 'pay', 'offer_key' => 'pro_monthly', 'starts_at' => now(),
            'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'cloud-concurrency-fixture'),
            'device_name' => 'desktop test', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
    }

    private function accept(string $label = 'same'): void
    {
        $request = Request::create('/api/cloud-computer/connect/mac', 'POST', [], [], [], ['HTTP_USER_AGENT' => $label]);
        $choices = new ConnectSelections([['key' => AccessProjects::key('selected'), 'name' => 'Selected', 'allowed' => true]],
            ['claude' => $label === 'claude', 'codex' => $label === 'codex', 'github' => false]);
        app(ConnectAgreement::class)->accept($this->user->id, app(ConnectConsent::class)->current(), 'mac', $request, $choices);
    }

    private function move(string $id): array
    {
        try { return app(\App\Services\CloudComputer\Owners\ConversationOwners::class)->set($this->user->id, 'claude', $id, 'Selected', 'cloud', 0, null); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { return [$e->getResponse()->getStatusCode()]; }
    }

    private function withdraw(): int
    {
        return $this->withToken('cloud-concurrency-fixture')->deleteJson('/api/cloud-computer/connect')->assertOk()->status();
    }

    public function test_racing_first_moves_have_exactly_one_winner_and_no_counter_reset(): void
    {
        $this->accept();
        $results = $this->race(array_fill(0, 8, fn () => $this->move('same-conversation')));
        $this->assertCount(1, array_filter($results, fn ($result) => $result[0] === true));
        $this->assertSame([1], DB::table('cloud_conversation_owners')->pluck('generation')->all());
        foreach ($results as $result) $this->assertSame(1, $result[1]['generation']);
    }

    public function test_owner_writes_racing_with_withdrawal_cannot_recreate_metadata(): void
    {
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $this->accept();
            $this->race([fn () => $this->move('owner-'.$attempt), fn () => $this->withdraw()]);
            $this->assertFalse(app(ConnectConsent::class)->connected($this->user->id));
            $this->assertSame(0, DB::table('cloud_conversation_owners')->count());
        }
    }

    public function test_events_racing_with_withdrawal_cannot_recreate_activity(): void
    {
        for ($attempt = 0; $attempt < 8; $attempt++) {
            // Complete the prior fake stop before reviewing a new connection. No provider is contacted.
            DB::table('cloud_workspaces')->where('user_id', $this->user->id)->update(['state' => 'stopped', 'runtime_token_hash' => null]);
            $this->accept();
            $w = DB::table('cloud_workspaces')->where('user_id', $this->user->id)->first();
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'ready', 'runtime_token_hash' => hash('sha256', 'fixture'), 'generation' => $attempt + 1]);
            $w = DB::table('cloud_workspaces')->where('id', $w->id)->first();
            $this->race([
                function () use ($w, $attempt) {
                    try {
                        return app(\App\Services\CloudComputer\Activity\HostEvents::class)->ingest($w,
                            [['provider' => 'claude', 'id' => 'event-'.$attempt, 'project' => 'Selected', 'phase' => 'waiting', 'at' => now()->toIso8601String()]]);
                    } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { return $e->getResponse()->getStatusCode(); }
                    catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { return $e->getStatusCode(); }
                },
                fn () => $this->withdraw(),
            ]);
            $this->assertFalse(app(ConnectConsent::class)->connected($this->user->id));
            $this->assertSame(0, DB::table('cloud_host_events')->count());
        }
    }
}
