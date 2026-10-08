<?php

namespace Tests\Integration;

use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\CloudComputer\{DeviceFaceApproval, FaceKeys};
use App\Services\Remote\{RemoteAccessException, RemoteTrustedDevices};
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Real separate workers; only an explicitly disposable local PostgreSQL database is allowed. */
class PhoneVerificationPostgresTest extends TestCase
{
    use \Tests\Support\RemotePostgresWorkers;

    protected function setUp(): void
    {
        if (getenv('DB_CONNECTION') !== 'pgsql' || getenv('REMOTE_POSTGRES_CONCURRENCY') !== '1'
            || ! str_starts_with((string) getenv('DB_DATABASE'), 'vibyra_remote_security_')
            || getenv('DB_HOST') !== '127.0.0.1' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires an explicitly enabled disposable local PostgreSQL database.');
        }
        parent::setUp();
        $this->assertSame(getenv('DB_DATABASE'), DB::connection()->getDatabaseName());
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('127.0.0.1', DB::connection()->getConfig('host'));
        $this->assertEmpty(DB::connection()->getConfig('url'));
        DB::statement('DROP SCHEMA public CASCADE'); DB::statement('CREATE SCHEMA public');
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['cache.default' => 'database', 'cloud_workspaces.face_approval' => true]); Cache::purge();
    }

    private function devices(): array
    {
        $user = User::factory()->create();
        $session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', random_bytes(32)),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(random_bytes(32)), 'name' => 'Test Cloud',
            'authorization_generation' => 1, 'registered_at' => now(), 'remote_access_mode' => 'trusted']);
        $id = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $id, 'user_id' => $user->id, 'remote_host_id' => $host->id,
            'kind' => 'computer', 'name' => 'QA', 'project_id' => 'qa', 'app_name' => 'qa-'.$id, 'state' => 'ready',
            'created_at' => now(), 'updated_at' => now()]);
        $devices = [];
        for ($i = 0; $i < 2; $i++) {
            $devices[] = TrustedDevice::create(['uuid' => (string) Str::uuid(), 'user_id' => $user->id, 'remote_host_id' => $host->id,
                'authorization_generation' => 1, 'public_key' => bin2hex(random_bytes(32)), 'device_name' => 'QA phone',
                'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(10), 'permissions' => ['terminal:access']]);
        }
        $keys = sodium_crypto_box_keypair();
        app(FaceKeys::class)->enroll($session, bin2hex(sodium_crypto_box_publickey($keys)));
        $c = app(FaceKeys::class)->challenge($session);
        $proof = ['id' => $c['id'], 'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $keys))];
        return [$session, $host, $devices, $proof];
    }

    private function approve($session, $host, $device, $proof): bool
    {
        try { app(DeviceFaceApproval::class)->approve($session, $host->host_id, $device->uuid, $proof); return true; }
        catch (RemoteAccessException $error) { if (! in_array($error->status, [403, 409], true)) throw $error; return false; }
    }

    public function test_one_face_proof_cannot_approve_two_devices_in_parallel(): void
    {
        [$session, $host, $devices, $proof] = $this->devices();
        $result = $this->race(array_map(fn ($d) => fn () => $this->approve($session, $host, $d, $proof), $devices));
        sort($result); $this->assertSame([false, true], $result);
        $this->assertSame(1, TrustedDevice::whereNotNull('approved_at')->count());
    }

    public function test_revocation_racing_face_approval_always_leaves_the_device_revoked(): void
    {
        [$session, $host, $devices, $proof] = $this->devices(); $device = $devices[0];
        $this->race([fn () => $this->approve($session, $host, $device, $proof),
            fn () => app(RemoteTrustedDevices::class)->revoke($session, $device->uuid)->revoked_at !== null]);
        $this->assertNotNull($device->fresh()->revoked_at);
        $this->assertFalse($device->fresh()->trusted());
    }

    public function test_native_login_completion_can_be_collected_only_once_across_workers(): void
    {
        config(['services.google_desktop_oauth.client_id' => 'fixture',
            'services.google_desktop_oauth.client_secret' => 'fixture',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/auth']);
        $flows = app(DesktopProviderOAuthFlow::class); $secret = str_repeat('a', 64);
        $start = $flows->start('google', ['flowSecret' => $secret, 'appReturn' => 'vibyra-app-v1']);
        parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);
        $flow = $flows->consumeState('google', $query['state']);
        $flows->finish($start['flowId'], ['ok' => true, 'status' => 'complete', 'twoFactor' => ['challengeId' => 'fixture']]);
        $claim = fn () => app(DesktopProviderOAuthFlow::class)->status('google', $start['flowId'], null, $secret, $flow['appReturnCode'])['status'];
        $result = $this->race([$claim, $claim]); sort($result);
        $this->assertSame(['complete', 'expired'], $result);
    }
}
