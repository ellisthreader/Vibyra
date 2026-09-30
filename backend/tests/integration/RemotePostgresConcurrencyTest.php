<?php

namespace Tests\Integration;

use App\Models\{RemoteHost, RemoteSession, TrustedDevice, User, VibyraSession};
use App\Services\Remote\{RelayAuthorization, RemoteAccessException, RemoteAccountSecurity, RemoteDeviceProof, RemoteSessionCreation, RemoteTrustedDevices};
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Tests\TestCase;

/** Opt-in: explicitly point at a disposable local PostgreSQL database. */
class RemotePostgresConcurrencyTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers, \Tests\Support\RemoteSecurityFixture;

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
        // Committed fixtures are visible across processes. Rebuild only the
        // explicitly named disposable database; no enclosing test transaction.
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => str_repeat('x', 40),
            'remote.relay_signing_secret' => str_repeat('x', 40), 'remote.relay_admin_secret' => str_repeat('x', 40),
            'remote.require_plan' => false, 'vibes.remote_access_live' => true,
            'remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test']);
        Queue::fake();
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'grantId' => $request['grantId']]));
    }

    private function fixture(): array
    {
        $user = User::factory()->create();
        $app = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', random_bytes(32)),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(random_bytes(32)), 'name' => 'Test Mac',
            'authorization_generation' => 1, 'registered_at' => now(), 'online_until' => now()->addMinute(), 'remote_access_mode' => 'trusted']);
        $request = $this->secureRemoteRequest($user, $app, $host);
        $grant = app(RemoteSessionCreation::class)->create($user, $host->host_id, 'Test phone', $app->id, $request);
        return [$app, TrustedDevice::where('uuid', $request['deviceId'])->firstOrFail(), $grant];
    }

    public function test_two_connections_can_admit_the_same_grant_only_once(): void
    {
        [, , $grant] = $this->fixture();
        $admit = fn () => app(RelayAuthorization::class)->allows($grant['token'], false);
        $result = $this->race([$admit, $admit]);
        sort($result);
        $this->assertSame([false, true], $result);
        $this->assertSame('CONNECTING', RemoteSession::where('grant_id', $grant['sessionId'])->value('status'));
    }

    public function test_two_connections_can_consume_device_proof_only_once(): void
    {
        [$app, $device] = $this->fixture();
        $proof = $this->freshRemoteProof($app, $device->uuid);
        $consume = function () use ($app, $device, $proof) {
            try {
                app(RemoteDeviceProof::class)->consume($app, $device->uuid, 'connect', $proof['challengeId'], $proof['proof'], $proof['permissions']);
                return true;
            } catch (RemoteAccessException $error) {
                if ($error->status !== 403) throw $error;
                return false;
            }
        };
        $result = $this->race([$consume, $consume]);
        sort($result);
        $this->assertSame([false, true], $result);
    }

    public function test_device_revocation_racing_admission_leaves_no_usable_session(): void
    {
        [$app, $device, $grant] = $this->fixture();
        $this->race([
            fn () => app(RelayAuthorization::class)->allows($grant['token'], false),
            fn () => app(RemoteTrustedDevices::class)->revoke($app, $device->uuid)->revoked_at !== null,
        ]);
        $this->assertSame('REVOKED', RemoteSession::where('grant_id', $grant['sessionId'])->value('status'));
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], false));
    }

    public function test_account_revocation_racing_passkey_begin_cannot_leave_a_valid_ceremony(): void
    {
        [$app, $device] = $this->fixture();
        $keys = $this->remoteFixtureKeys[$device->uuid];
        $challenge = app(RemoteDeviceProof::class)->challenge($app, $device->uuid, 'passkey');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
        $begin = function () use ($app, $device, $challenge, $proof) {
            try {
                return DB::transaction(function () use ($app, $device, $challenge, $proof) {
                    app(RemoteDeviceProof::class)->consume($app, $device->uuid, 'passkey', $challenge['challengeId'], $proof);
                    app(PasskeyCeremonies::class)->begin($app, $device->id, 'register');
                    return 'created';
                });
            } catch (RemoteAccessException $error) {
                if ($error->status !== 403) throw $error;
                return 'denied';
            }
        };
        $this->race([$begin, function () use ($app) {
            return app(RemoteAccountSecurity::class)->updateIdentity($app->user_id, function (User $user) use ($app) {
                $user->forceFill(['email' => 'changed-'.$app->user_id.'@example.test'])->save();
                app(RemoteAccountSecurity::class)->revoke($app->user_id);
                return 'revoked';
            });
        }]);
        $this->assertSame(0, DB::table('remote_passkey_ceremonies')->whereNull('invalidated_at')->count());
        $this->assertSame(0, DB::table('remote_strong_auth')->count());
        $this->assertSame('changed-'.$app->user_id.'@example.test', User::findOrFail($app->user_id)->email);
        $this->assertSame(0, RemoteSession::whereNull('revoked_at')->count());
    }

    public function test_identity_retry_reloads_models_and_commits_revocation_once(): void
    {
        [$app] = $this->fixture(); $attempts = 0; $models = [];
        app(RemoteAccountSecurity::class)->updateIdentity($app->user_id, function (User $user) use ($app, &$attempts, &$models) {
            $models[] = $user;
            $user->forceFill(['email' => 'retry@example.test'])->save();
            app(RemoteAccountSecurity::class)->revoke($app->user_id);
            if (++$attempts === 1) throw new \PDOException('deadlock detected');
        });
        $this->assertSame(2, $attempts);
        $this->assertNotSame($models[0], $models[1]);
        $this->assertSame('retry@example.test', User::findOrFail($app->user_id)->email);
        $this->assertSame(0, RemoteSession::whereNull('revoked_at')->count());
        $this->assertSame(1, RemoteHost::where('user_id', $app->user_id)->value('reset_revision'));
        $this->assertSame(1, DB::table('remote_session_revocations')->count());
        $this->assertSame(1, DB::table('security_events')->where('event_type', 'REMOTE_SESSION_REVOKED')->count());
        Http::assertSentCount(1);
    }
}
