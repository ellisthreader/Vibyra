<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, User, VibyraSession};
use App\Services\Auth\Totp;
use App\Services\Remote\{RelayAuthorization, RemoteAccess};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Notification, Password};
use Tests\Support\RemoteSecurityFixture;
use Tests\TestCase;

class RemoteAccountSecurityTest extends TestCase
{
    use RefreshDatabase, RemoteSecurityFixture;
    private int $relayStatus = 200;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => str_repeat('s', 40),
            'remote.relay_signing_secret' => str_repeat('s', 40), 'remote.relay_admin_secret' => str_repeat('s', 40),
            'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Notification::fake();
        Http::fake(fn ($request) => Http::response(['disconnected' => true, 'grantId' => $request->data()['grantId'] ?? null, 'generation' => $request->data()['generation'] ?? null], $this->relayStatus));
    }

    private function accountSession(User $user, string $name): VibyraSession
    {
        return VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $name), 'device_name' => $name,
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
    }

    private function connected(): array
    {
        $user = User::factory()->create(['provider' => 'email']); $app = $this->accountSession($user, 'phone');
        $keys = sodium_crypto_box_keypair();
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(sodium_crypto_box_publickey($keys)),
            'name' => 'Mac', 'registered_at' => now(), 'online_until' => now()->addHour(), 'authorization_generation' => 1]);
        $grant = $this->connect($app, $host);
        return [$user, $app, $host, $grant, ['Authorization' => 'Bearer phone'], $keys];
    }

    private function connect(VibyraSession $app, RemoteHost $host): array
    {
        $request = $this->secureRemoteRequest($app->user, $app, $host);
        $grant = app(RemoteAccess::class)->connect($app->user, $host->host_id, 'Phone', $app->id, $request);
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        return $grant;
    }

    public function test_logout_terminates_only_remote_sessions_bound_to_that_app_session(): void
    {
        [$user, , $host, $first, $headers] = $this->connected();
        $other = $this->accountSession($user, 'second'); $second = $this->connect($other, $host);
        $this->deleteJson('/api/auth/logout', [], $headers)->assertOk();
        $this->assertFalse(app(RelayAuthorization::class)->allows($first['token'], true));
        $this->assertTrue(app(RelayAuthorization::class)->allows($second['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $first['sessionId'], 'status' => 'REVOKED']);
        $this->assertDatabaseCount('remote_strong_auth', 1);
        $this->assertDatabaseCount('remote_session_revocations', 1);
    }

    public function test_revoke_all_normal_sessions_terminates_all_remote_sessions(): void
    {
        [$user, , $host, $first, $headers] = $this->connected();
        $second = $this->connect($this->accountSession($user, 'second'), $host);
        $this->deleteJson('/api/account/sessions', [], $headers)->assertOk();
        foreach ([$first, $second] as $grant) $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseCount('remote_strong_auth', 0);
        $this->assertDatabaseCount('remote_session_revocations', 2);
    }

    public function test_password_reset_revokes_remote_sessions_and_records_metadata_only(): void
    {
        [$user, , , $grant] = $this->connected();
        $this->postJson('/api/auth/password/reset', ['email' => $user->email, 'token' => Password::broker()->createToken($user),
            'password' => 'new-secret-password', 'passwordConfirmation' => 'new-secret-password'])->assertOk();
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'REVOKED']);
        $this->assertDatabaseHas('security_events', ['user_id' => $user->id, 'event_type' => 'PASSWORD_CHANGED']);
        $this->assertStringNotContainsString('new-secret-password', json_encode(DB::table('security_events')->get()));
        $this->assertDatabaseCount('remote_strong_auth', 0);
    }

    public function test_confirming_second_factor_ends_remote_sessions_without_logging_out_the_account(): void
    {
        [, , , $grant, $headers] = $this->connected();
        $secret = $this->postJson('/api/account/2fa/start', [], $headers)->assertOk()->json('secret');
        $totp = app(Totp::class); $code = $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD));
        $this->postJson('/api/account/2fa/confirm', ['code' => $code], $headers)->assertOk();
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->getJson('/api/session', $headers)->assertOk();
        $this->assertDatabaseCount('remote_strong_auth', 0);
    }
    public function test_email_change_ends_remote_sessions_but_display_name_does_not(): void
    {
        [, , , $grant, $headers] = $this->connected();
        $this->postJson('/api/account/profile', ['name' => 'Updated Name'], $headers)->assertOk();
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->postJson('/api/account/profile', ['email' => 'new-address@example.com'], $headers)->assertOk();
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'status' => 'REVOKED']);
        $this->assertDatabaseCount('remote_strong_auth', 0);
        $this->getJson('/api/session', $headers)->assertOk();
    }

    public function test_only_successful_verified_phone_change_ends_remote_access(): void
    {
        [, , , $grant, $headers] = $this->connected();
        $phone = $this->mock(\App\Services\Auth\PhoneVerificationService::class);
        $phone->shouldReceive('start')->once()->with('+447700900123');
        $phone->shouldReceive('check')->once()->with('+447700900123', '000000')->andReturn(false);
        $phone->shouldReceive('check')->once()->with('+447700900123', '123456')->andReturn(true);
        $this->postJson('/api/account/phone/start', ['phoneNumber' => '+447700900123'], $headers)->assertOk();
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->postJson('/api/account/phone/check', ['code' => '000000'], $headers)->assertStatus(422);
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->postJson('/api/account/phone/check', ['code' => '123456'], $headers)->assertOk();
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->assertDatabaseCount('remote_strong_auth', 0);
    }

    public function test_manual_token_rotation_ends_only_that_app_sessions_remote_access(): void
    {
        [$user, , $host, $first, $headers] = $this->connected();
        $second = $this->connect($this->accountSession($user, 'second'), $host);
        $token = $this->postJson('/api/auth/session/rotate', [], $headers)->assertOk()->json('token');
        $this->assertFalse(app(RelayAuthorization::class)->allows($first['token'], true));
        $this->assertTrue(app(RelayAuthorization::class)->allows($second['token'], true));
        $this->assertDatabaseCount('remote_strong_auth', 1);
        $this->getJson('/api/session', ['Authorization' => 'Bearer '.$token])->assertOk();
    }

    public function test_account_deletion_keeps_host_disconnect_retry_after_cascade_and_generation_on_reenrollment(): void
    {
        [$user, , $host, $grant, , $keys] = $this->connected();
        \Illuminate\Support\Facades\Storage::fake('local');
        $this->relayStatus = 503;
        app(\App\Services\Remote\RemoteAccountSecurity::class)->deleteUser((int) $user->id);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseCount('remote_hosts', 0);
        $this->assertDatabaseCount('remote_sessions', 0);
        $this->assertDatabaseHas('remote_revocations', ['host_id' => $host->host_id, 'generation' => 2, 'acknowledged_at' => null]);
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->relayStatus = 200;
        $this->travel(6)->seconds();
        $this->assertSame(1, app(\App\Services\Remote\RemoteRevocations::class)->deliver());
        $next = User::factory()->create(); $app = $this->accountSession($next, 'new-account');
        $challenge = app(\App\Services\Remote\RemoteIdentityProof::class)->challenge($next, $app->id, $host->host_id, 'register');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
        $registered = app(RemoteAccess::class)->register($next, $host->host_id, 'Mac', 'macos', 'test', $app->id, $challenge['challengeId'], $proof);
        $this->assertSame(['userId' => (string) $next->id, 'generation' => 2], $registered['authorizationContext']);
        $this->assertSame('disabled', $registered['host']['remoteAccessMode']);
    }

}
