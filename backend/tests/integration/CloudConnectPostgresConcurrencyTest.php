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
class CloudConnectPostgresConcurrencyTest extends TestCase
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

    public function test_concurrent_connects_keep_one_computer_and_whole_reviewed_choices(): void
    {
        $this->race(array_map(fn ($label) => function () use ($label) { $this->accept($label); return true; }, ['claude', 'codex', 'neither', 'claude']));
        $this->assertSame(1, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->count());
        $this->assertSame(4, DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->count());
        $last = DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->orderByDesc('id')->first();
        $settings = DB::table('cloud_access_settings')->where('user_id', $this->user->id)->first();
        $this->assertSame([$last->user_agent === 'claude', $last->user_agent === 'codex', false],
            [(bool) $settings->claude_enabled, (bool) $settings->codex_enabled, (bool) $settings->github_enabled]);
        $this->assertSame([AccessProjects::key('selected')], app(AccessProjects::class)->allowedKeys($this->user->id));
    }

    public function test_connect_racing_with_withdrawal_never_purges_a_newer_accepted_selection(): void
    {
        $this->accept();
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $this->race([
                function () { $this->accept(); return true; },
                fn () => $this->withToken('cloud-concurrency-fixture')->deleteJson('/api/cloud-computer/connect')->assertOk()->status(),
            ]);
            $allowed = app(AccessProjects::class)->allowedKeys($this->user->id);
            $this->assertSame(app(ConnectConsent::class)->connected($this->user->id) ? [AccessProjects::key('selected')] : [], $allowed);
        }
    }

    private function login(int $seq, ?string $origin): void
    {
        $content = 'cloud-connect-race-fixture-'.$seq;
        $stream = fopen('php://temp', 'r+'); fwrite($stream, $content); rewind($stream);
        try { app(SyncLogins::class)->receive($this->user->id, 'codex', $seq, hash('sha256', $content), $stream, strlen($content), $origin); }
        finally { fclose($stream); }
    }

    public function test_copy_migration_racing_with_a_cloud_login_cannot_remove_the_new_login(): void
    {
        $this->accept('codex');
        app(\App\Services\CloudComputer\AccessProviders::class)->setCodex($this->user->id, 'allowed');
        $this->login(1, null);
        $this->race([
            function () { $this->login(2, 'cloud'); return true; },
            function () { app(SyncLogins::class)->remove($this->user->id, 'codex', 1); return true; },
        ]);
        $row = DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->where('provider', 'codex')->first();
        $this->assertSame(['cloud', 2], [$row->origin, (int) $row->seq]);
        $this->assertNotNull($row->blob_id);
        $this->assertTrue(Storage::disk('cloud-sync')->exists($row->path));
    }

    public function test_runtime_ack_racing_with_login_replacement_keeps_the_new_inbox_item(): void
    {
        $this->accept('codex');
        $this->login(1, 'cloud');
        for ($seq = 2; $seq <= 9; $seq++) {
            $old = DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->where('provider', 'codex')->first();
            $this->race([
                function () use ($seq) { $this->login($seq, 'cloud'); return true; },
                function () use ($old) { app(SyncLogins::class)->applied($this->user->id, $old->blob_id, ['ok' => true]); return true; },
            ]);
            $row = DB::table('cloud_sync_logins')->where('id', $old->id)->first();
            $this->assertSame($seq, (int) $row->seq);
            $this->assertNotNull($row->blob_id);
            $this->assertLessThan($seq, (int) $row->applied_seq);
            $this->assertTrue(Storage::disk('cloud-sync')->exists($row->path));
        }
    }

    public function test_parallel_project_uploads_cannot_exceed_the_account_quota(): void
    {
        $this->accept();
        config(['cloud_workspaces.sync_quota_bytes' => 1024, 'cloud_workspaces.sync_max_blob_bytes' => 4096]);
        $projects = [];
        foreach (['quota-one', 'quota-two'] as $name) {
            $key = AccessProjects::key($name);
            app(AccessProjects::class)->decide($this->user->id, [['key' => $key, 'name' => $name, 'allowed' => true]], 'mac');
            $projects[] = app(\App\Services\CloudComputer\SyncProjects::class)->grant($this->user->id, $key, $name, null);
        }
        $barrier = sys_get_temp_dir().'/cloud-quota-barrier-'.bin2hex(random_bytes(8));
        mkdir($barrier, 0700);
        // Both workers pass the optimistic quota precheck and store their files
        // before either can perform the final database insertion.
        app()->instance(\App\Services\CloudComputer\SyncUpload::class, new class($barrier) extends \App\Services\CloudComputer\SyncUpload {
            public function __construct(private string $barrier) {}
            public function store(string $tmp, string $path): void {
                parent::store($tmp, $path); touch($this->barrier.'/'.getmypid());
                $deadline = microtime(true) + 10;
                while (count(glob($this->barrier.'/*')) < 2) {
                    if (microtime(true) > $deadline) throw new \RuntimeException('quota barrier timed out');
                    usleep(10000);
                }
            }
        });
        try {
            $results = $this->race(array_map(fn ($project) => function () use ($project) {
                $bytes = str_repeat('Q', 1024); $stream = fopen('php://temp', 'r+'); fwrite($stream, $bytes); rewind($stream);
                try {
                    app(\App\Services\CloudComputer\SyncBlobs::class)->receive($project, 'up',
                        ['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => null, 'sha256' => hash('sha256', $bytes)], $stream, null, 1024);
                    return 200;
                } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { return $e->getResponse()->getStatusCode(); }
                finally { fclose($stream); }
            }, $projects));
            sort($results);
            $this->assertSame([200, 413], $results);
            $this->assertSame(1024, app(\App\Services\CloudComputer\SyncRetention::class)->usedBytes($this->user->id));
            $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        } finally {
            foreach (glob($barrier.'/*') as $file) unlink($file);
            rmdir($barrier);
        }
    }
    public function test_same_offset_parallel_parts_cannot_append_duplicate_bytes(): void
    {
        $this->partsRace(false);
    }

    public function test_parallel_part_admission_never_exceeds_the_open_upload_cap(): void
    {
        $this->partsRace(true);
    }

    private function partsRace(bool $many): void
    {
        $this->accept();
        config(['cloud_workspaces.sync_quota_bytes' => 1048576, 'cloud_workspaces.sync_max_blob_bytes' => 4096]);
        $dir = sys_get_temp_dir().'/cloud-parts-race-'.bin2hex(random_bytes(8)); mkdir($dir, 0700);
        config(['cloud_workspaces.sync_parts_dir' => $dir]);
        if (!in_array('cloudslowfixture', stream_get_wrappers(), true)) stream_wrapper_register('cloudslowfixture', SlowCloudPartStream::class);
        $projects = [];
        foreach ($many ? range(1, 5) : [1] as $number) {
            $name = 'part-'.$number; $key = AccessProjects::key($name);
            app(AccessProjects::class)->decide($this->user->id, [['key' => $key, 'name' => $name, 'allowed' => true]], 'mac');
            $projects[] = app(\App\Services\CloudComputer\SyncProjects::class)->grant($this->user->id, $key, $name, null);
        }
        if (!$many) $projects[] = $projects[0];
        try {
            $results = $this->race(array_map(fn ($project) => function () use ($project) {
                $stream = fopen('cloudslowfixture://body', 'r');
                try {
                    app(\App\Services\CloudComputer\SyncUploadParts::class)->receive($project,
                        ['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => null, 'sha256' => hash('sha256', str_repeat('R', 3072))],
                        0, 3072, $stream, 1024);
                    return 200;
                } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { return $e->getResponse()->getStatusCode(); }
                finally { fclose($stream); }
            }, $projects));
            sort($results);
            $this->assertSame($many ? [200, 200, 200, 200, 429] : [200, 409], $results);
            $parts = glob($dir.'/*.part');
            $this->assertCount($many ? 4 : 1, $parts);
            foreach ($parts as $part) { clearstatcache(true, $part); $this->assertSame(1024, filesize($part)); }
        } finally {
            foreach (glob($dir.'/*') as $file) unlink($file);
            rmdir($dir);
        }
    }

}


/** A slow fixture body lets independent workers reach the offset/admission boundary together. */
class SlowCloudPartStream
{
    public $context;
    private int $position = 0;
    public function stream_open(string $path, string $mode, int $options, ?string &$opened): bool { return true; }
    public function stream_read(int $count): string {
        usleep(250000);
        $bytes = substr(str_repeat('R', 1024), $this->position, $count);
        $this->position += strlen($bytes); return $bytes;
    }
    public function stream_eof(): bool { return $this->position >= 1024; }
    public function stream_stat(): array { return []; }
}
