<?php
namespace Tests\Integration;

use App\Models\User;
use App\Services\CloudComputer\SyncQueue;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Two real PDO connections with the losing acknowledgement paused after its initial read. */
class SyncAckPostgresConcurrencyTest extends TestCase
{
    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('REMOTE_POSTGRES_CONCURRENCY') !== '1'
            || !str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_remote_security_')
            || getenv('DB_HOST') !== '127.0.0.1')
            $this->markTestSkipped('Requires explicitly enabled disposable local PostgreSQL.');
        parent::setUp();
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertEmpty(DB::connection()->getConfig('url'));
        DB::statement('DROP SCHEMA public CASCADE'); DB::statement('CREATE SCHEMA public');
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['database.connections.qa_competitor' => config('database.connections.pgsql')]);
        Queue::fake(); Http::preventStrayRequests();
    }

    protected function tearDown(): void
    {
        DB::disconnect('qa_competitor');
        parent::tearDown();
    }

    private function overlappingAck(bool $winnerApplied, string $kind = 'code'): void
    {
        $user = User::factory()->create();
        $project = DB::table('cloud_sync_projects')->insertGetId(['user_id' => $user->id, 'project_key' => str_repeat('a', 32),
            'name' => 'race-fixture', 'created_at' => now(), 'updated_at' => now()]);
        $id = (string) Str::uuid();
        DB::table('cloud_sync_blobs')->insert(['id' => $id, 'user_id' => $user->id, 'project_id' => $project,
            'path' => 'fixture/sealed', 'direction' => 'down', 'kind' => $kind, 'seq' => 1, 'recipient_mac_id' => 1,
            'sha256' => str_repeat('a', 64), 'bytes' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertNotSame(DB::connection('pgsql')->getPdo(), DB::connection('qa_competitor')->getPdo());
        $interleaved = false;
        DB::listen(function ($query) use (&$interleaved, $id, $user, $winnerApplied) {
            if ($interleaved || $query->connectionName !== 'pgsql' || !str_starts_with($query->sql, 'select')
                || !str_contains($query->sql, 'cloud_sync_blobs') || !in_array($id, $query->bindings, true)) return;
            // The losing read has fetched the unsettled row. Commit the other connection before it can update.
            $interleaved = true;
            DB::setDefaultConnection('qa_competitor');
            try { app(SyncQueue::class)->ack($user->id, $id, $winnerApplied, 'needs full', [], true); }
            finally { DB::setDefaultConnection('pgsql'); }
        });
        if ($kind === 'transcripts') $this->mock(\App\Services\CloudComputer\Activity\HostEvents::class)->shouldNotReceive('returned');
        app(SyncQueue::class)->ack($user->id, $id, !$winnerApplied, 'stale refusal', [['provider' => 'claude', 'id' => 'race-session']], true);
        $this->assertTrue($interleaved, 'The competing acknowledgement must land after the first read.');
        $blob = DB::table('cloud_sync_blobs')->where('id', $id)->first();
        $this->assertSame($winnerApplied, $blob->applied_at !== null);
        $this->assertSame(!$winnerApplied, $blob->failed_at !== null);
        $this->assertSame(!$winnerApplied, app(SyncQueue::class)->state($user->id)[0][$kind === 'code' ? 'downNeedFull' : 'transcriptsNeedFull']);
        $this->assertSame($winnerApplied ? null : 'needs_full: needs full', $blob->error);
    }

    public function test_stale_failure_cannot_overwrite_an_applied_ack(): void
    {
        $this->overlappingAck(true);
    }

    public function test_stale_success_cannot_overwrite_a_refused_ack(): void
    {
        $this->overlappingAck(false);
    }
    public function test_losing_success_cannot_emit_a_returned_conversation_event(): void
    {
        $this->overlappingAck(false, 'transcripts');
    }

}
