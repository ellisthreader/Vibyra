<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Remote\{RemoteAccess, RemoteAccountSecurity, RemoteDeviceProof, RemoteHostPolicy, RemoteIdentityProof, RemoteRestrictions, RemoteTrustedDevices};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class RemoteRestrictionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp(); Queue::fake();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => str_repeat('x', 40),
            'remote.relay_admin_secret' => str_repeat('x', 40), 'remote.require_plan' => false]);
        Http::fake(fn ($r) => Http::response(['disconnected' => true, 'generation' => $r['generation'], 'grantId' => $r['grantId']]));
    }

    private function account(): VibyraSession
    {
        $user = User::factory()->create();
        return VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'phone-'.$user->id),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
    }

    private function fixture(): array
    {
        $app = $this->account(); $keys = sodium_crypto_box_keypair();
        $host = RemoteHost::create(['user_id' => $app->user_id, 'host_id' => bin2hex(sodium_crypto_box_publickey($keys)),
            'name' => 'Mac', 'authorization_generation' => 1, 'remote_access_mode' => 'disabled', 'registered_at' => now()]);
        return [$app, $host, $keys];
    }

    private function headers(VibyraSession $app): array { return ['Authorization' => 'Bearer phone-'.$app->user_id]; }
    private function path(RemoteHost $host): string { return '/api/remote/hosts/'.$host->host_id.'/restrictions'; }
    private function solve(array $challenge, string $keys): string { return base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys)); }
    private function pending(VibyraSession $app, RemoteHost $host): TrustedDevice
    {
        return app(RemoteTrustedDevices::class)->register($app, ['hostId' => $host->host_id, 'publicKey' => bin2hex(sodium_crypto_box_publickey(sodium_crypto_box_keypair())),
            'deviceName' => 'Phone', 'permissions' => ['preview:access']], '127.0.0.1');
    }

    public function test_initial_disabled_is_not_an_explicit_command_and_snapshots_are_owned_private(): void
    {
        [$app, $host] = $this->fixture(); $other = $this->account();
        $this->getJson($this->path($host))->assertUnauthorized();
        $this->getJson($this->path($host), $this->headers($other))->assertNotFound();
        $reply = $this->getJson($this->path($host), $this->headers($app))->assertOk()
            ->assertJsonPath('control.disableRevision', 0)->assertJsonPath('control.resetRevision', 0)->assertJsonPath('control.revision', 0)
            ->assertJsonPath('control.userId', (string) $app->user_id)->assertJsonPath('control.generation', 1);
        $this->assertStringContainsString('no-store', $reply->headers->get('Cache-Control'));
    }

    public function test_explicit_disable_is_superseded_only_by_new_host_key_consent(): void
    {
        [$app, $host, $keys] = $this->fixture(); $policy = app(RemoteHostPolicy::class);
        $policy->disableAll($app);
        $this->getJson($this->path($host), $this->headers($app))->assertOk()->assertJsonPath('control.disableRevision', 1);
        $challenge = $policy->challenge($app, $host->host_id, 'ask');
        $state = $policy->change($app, $host->host_id, 'ask', $challenge['challengeId'], $this->solve($challenge, $keys));
        $this->assertSame(2, $state['securityRevision']);
        $this->getJson($this->path($host).'?after=0', $this->headers($app))->assertOk()
            ->assertJsonPath('control.disableRevision', 0)->assertJsonPath('control.generation', 1)->assertJsonPath('control.nextRevision', 2);
    }

    public function test_key_tombstone_survives_uuid_reset_until_exact_computer_approval(): void
    {
        [$app, $host, $keys] = $this->fixture(); $devices = app(RemoteTrustedDevices::class); $device = $this->pending($app, $host);
        // A repeated revoke must also publish a floor for pre-migration rows.
        $device->forceFill(['revoked_at' => now()])->save();
        $old = $device->uuid; $devices->revoke($app, $old);
        $new = $devices->register($app, ['hostId' => $host->host_id, 'publicKey' => $device->public_key, 'deviceName' => 'Phone', 'permissions' => ['preview:access']], null);
        $this->assertNotSame($old, $new->uuid);
        $this->getJson($this->path($host), $this->headers($app))->assertOk()->assertJsonPath('control.revokedDevices.0.publicKey', $device->public_key);
        $devices->revokeAll($app);
        $reset = $host->fresh()->reset_revision;
        $new = $devices->register($app, ['hostId' => $host->host_id, 'publicKey' => $device->public_key, 'deviceName' => 'Phone', 'permissions' => ['preview:access']], null);
        $challenge = $devices->decisionChallenge($app, $host->host_id, $new->uuid, 'approve');
        $approved = $devices->decide($app, $host->host_id, $new->uuid, 'approve', $challenge['challengeId'], $this->solve($challenge, $keys));
        $this->assertGreaterThan($reset, $devices->describe($approved)['approvedRevision']);
        $this->getJson($this->path($host), $this->headers($app))->assertOk()->assertJsonPath('control.revokedDevices', [])
            ->assertJsonPath('control.approvedDevices.0.revision', $approved->approved_revision);
    }

    public function test_global_revoke_and_account_security_changes_reset_hosts_without_cloud_devices(): void
    {
        [$app, $host] = $this->fixture(); $other = $this->account();
        app(RemoteTrustedDevices::class)->revokeAll($other);
        $this->assertSame(0, $host->fresh()->security_revision);
        $this->deleteJson('/api/security/devices', [], $this->headers($app))->assertOk()->assertJsonPath('revoked', 0);
        $events = DB::table('security_events')->where('user_id', $app->user_id)->where('event_type', 'DEVICE_REVOKED');
        $this->assertSame(1, (clone $events)->count());
        $this->assertSame(['reason' => 'all_devices', 'count' => 0], json_decode((clone $events)->value('metadata'), true));
        $this->assertSame(1, $host->fresh()->reset_revision);
        app(RemoteAccountSecurity::class)->revoke($app->user_id, [$app->id], 'logout');
        $this->assertSame(1, $host->fresh()->reset_revision);
        app(RemoteAccountSecurity::class)->revoke($app->user_id);
        $this->assertSame(2, $host->fresh()->reset_revision);
        $this->pending($app, $host); $this->pending($app, $host);
        $this->assertSame(2, app(RemoteTrustedDevices::class)->revokeAll($app));
        $this->assertSame(2, (clone $events)->count()); // One global event, no per-device duplicates.
    }

    public function test_pagination_is_bounded_and_snapshot_changes_do_not_skip_tombstones(): void
    {
        [$app, $host] = $this->fixture();
        $host->forceFill(['host_id' => str_repeat('a', 64), 'authorization_generation' => 7])->save();
        for ($i = 1; $i <= 101; $i++) TrustedDevice::create(['uuid' => (string) Str::uuid(), 'user_id' => $app->user_id, 'remote_host_id' => $host->id,
            'public_key' => str_pad(dechex($i), 64, '0', STR_PAD_LEFT), 'device_name' => 'Revoked', 'authorization_generation' => 1,
            'permissions' => [], 'pairing_code' => '123456', 'request_expires_at' => now(), 'revoked_at' => now(), 'revocation_revision' => $i]);
        $host->forceFill(['security_revision' => 101])->save();
        $first = $this->getJson($this->path($host), $this->headers($app))->assertOk()->assertJsonCount(100, 'control.revokedDevices')
            ->assertJsonPath('control.nextRevision', 100)->assertJsonPath('control.hasMore', true)->json();
        DB::transaction(fn () => app(RemoteRestrictions::class)->reset($host));
        $this->getJson($this->path($host).'?after=100&at=101', $this->headers($app))->assertStatus(409)->assertJsonPath('code', 'control_revision_changed');
        $second = $this->getJson($this->path($host).'?after=100', $this->headers($app))->assertOk()->assertJsonCount(1, 'control.revokedDevices')
            ->assertJsonPath('control.revokedDevices.0.revision', 101)->assertJsonPath('control.nextRevision', 102)->assertJsonPath('control.hasMore', false)->json();
        $this->getJson($this->path($host).'?after=103', $this->headers($app))->assertStatus(409);
        if (getenv('REMOTE_CONTROL_FIXTURE_EXPORT') === '1') {
            $this->assertSame('sqlite', DB::connection()->getDriverName()); $this->assertSame(':memory:', DB::connection()->getDatabaseName());
            $this->assertSame('1', $first['control']['userId']);
            $path = dirname(__DIR__, 3).'/host/fixtures';
            if (! is_dir($path)) mkdir($path, 0755, true);
            file_put_contents($path.'/remote-controls.json', json_encode(compact('first', 'second'), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
        }
    }

    public function test_transfer_clears_old_owner_intent_but_same_owner_reenrollment_preserves_it(): void
    {
        [$app, $host, $keys] = $this->fixture(); $device = $this->pending($app, $host);
        app(RemoteTrustedDevices::class)->revoke($app, $device->uuid);
        app(RemoteHostPolicy::class)->disableAll($app);
        app(RemoteAccountSecurity::class)->revoke($app->user_id);
        app(RemoteAccess::class)->revoke($app->user, $host->host_id);
        $this->enroll($app, $host, $keys, 'register');
        $same = app(RemoteRestrictions::class)->snapshot($app, $host->host_id);
        $this->assertSame(2, $same['disableRevision']); $this->assertSame(3, $same['resetRevision']);
        $this->assertCount(1, $same['revokedDevices']);
        $new = $this->account(); $this->enroll($new, $host, $keys, 'transfer');
        $state = app(RemoteRestrictions::class)->snapshot($new, $host->host_id);
        $this->assertGreaterThan($same['revision'], $state['revision']);
        $this->assertGreaterThan($same['generation'], $state['generation']);
        $this->assertSame(0, $state['disableRevision']); $this->assertSame(0, $state['resetRevision']);
        $this->assertSame([], $state['revokedDevices']); $this->assertSame([], $state['approvedDevices']);
        $this->getJson($this->path($host), $this->headers($app))->assertNotFound();
    }

    private function enroll(VibyraSession $app, RemoteHost $host, string $keys, string $purpose): void
    {
        $proof = app(RemoteIdentityProof::class)->challenge($app->user, $app->id, $host->host_id, $purpose);
        app(RemoteAccess::class)->register($app->user, $host->host_id, 'Mac', 'macos', 'test', $app->id, $proof['challengeId'], $this->solve($proof, $keys));
    }

    public function test_passkey_removal_advances_reset_and_polling_has_a_host_budget(): void
    {
        [$app, $host] = $this->fixture();
        $id = DB::table('passkey_credentials')->insertGetId(['user_id' => $app->user_id, 'credential_hash' => hash('sha256', 'key'),
            'credential_id' => 'key', 'public_key' => 'fixture', 'counter' => 0, 'device_name' => 'Phone', 'created_at' => now(), 'updated_at' => now()]);
        $this->deleteJson('/api/security/passkeys/'.$id, [], $this->headers($app))->assertOk();
        for ($i = 0; $i < 24; $i++) $this->getJson($this->path($host), $this->headers($app))->assertOk()->assertJsonPath('control.resetRevision', 1);
        $this->getJson($this->path($host), $this->headers($app))->assertStatus(429);
    }

    public function test_approved_key_overflow_and_unsafe_revisions_fail_without_partial_snapshots(): void
    {
        [$app, $host] = $this->fixture();
        for ($i = 1; $i <= 65; $i++) TrustedDevice::create(['uuid' => (string) Str::uuid(), 'user_id' => $app->user_id, 'remote_host_id' => $host->id,
            'public_key' => str_pad(dechex($i), 64, '0', STR_PAD_LEFT), 'device_name' => 'Approved', 'authorization_generation' => 1,
            'permissions' => [], 'pairing_code' => '123456', 'request_expires_at' => now(), 'approved_at' => now()]);
        $this->getJson($this->path($host), $this->headers($app))->assertStatus(503)->assertJsonMissingPath('control');
        TrustedDevice::where('remote_host_id', $host->id)->delete();
        $host->forceFill(['security_revision' => RemoteRestrictions::MAX_REVISION + 1])->save();
        $this->getJson($this->path($host), $this->headers($app))->assertStatus(503)->assertJsonMissingPath('control');
        $this->getJson($this->path($host).'?after=9007199254740992', $this->headers($app))->assertStatus(422);
    }
}
