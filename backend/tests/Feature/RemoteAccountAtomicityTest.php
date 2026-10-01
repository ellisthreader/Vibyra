<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, User, VibyraSession};
use App\Services\Auth\{SessionAuthenticator, Totp, TwoFactor};
use App\Services\Remote\{RelayAuthorization, RemoteAccess, RemoteSessionRevocations};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Notification};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\RemoteSecurityFixture;
use Tests\TestCase;

class RemoteAccountAtomicityTest extends TestCase
{
    use RefreshDatabase, RemoteSecurityFixture;

    private function connected(): array
    {
        config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => str_repeat('s', 40),
            'remote.relay_signing_secret' => str_repeat('s', 40), 'remote.relay_admin_secret' => str_repeat('s', 40),
            'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
        Notification::fake(); Http::fake();
        $user = User::factory()->create(['provider' => 'email']);
        $app = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'phone'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => bin2hex(random_bytes(32)),
            'name' => 'Mac', 'registered_at' => now(), 'online_until' => now()->addHour(), 'authorization_generation' => 1]);
        $request = $this->secureRemoteRequest($user, $app, $host);
        $grant = app(RemoteAccess::class)->connect($user, $host->host_id, 'Phone', $app->id, $request);
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], false));
        return [$user, $app, $grant, ['Authorization' => 'Bearer phone']];
    }

    private function authenticateSnapshot(User $user, VibyraSession $app): void
    {
        $app->setRelation('user', $user);
        $this->mock(SessionAuthenticator::class)->shouldReceive('authenticate')->andReturn([
            'session' => $app, 'using_previous_token' => false,
        ]);
    }

    public function test_stale_authenticated_email_cannot_skip_revocation_or_restore_omitted_email(): void
    {
        [$user, $app, $grant, $headers] = $this->connected();
        $this->authenticateSnapshot($user, $app);
        User::whereKey($user->id)->update(['email' => 'concurrent@example.test']);
        $this->postJson('/api/account/profile', ['name' => 'Updated'], $headers)->assertOk();
        $this->assertSame('concurrent@example.test', $user->fresh()->email);
        $this->assertTrue(app(RelayAuthorization::class)->allows($grant['token'], true));
        $this->postJson('/api/account/profile', ['email' => $user->email, 'currentPassword' => 'password'], $headers)->assertOk();
        $this->assertSame($user->email, $user->fresh()->email);
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertFalse(app(RelayAuthorization::class)->allows($grant['token'], true));
    }

    public function test_start_checks_current_enabled_factor_even_when_authentication_snapshot_is_stale(): void
    {
        [$user, $app, , $headers] = $this->connected();
        $this->authenticateSnapshot($user, $app);
        $fresh = $user->fresh(); $factor = app(TwoFactor::class);
        $secret = $factor->start($fresh); $totp = app(Totp::class);
        $factor->confirm($fresh, $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD)));
        $this->postJson('/api/account/2fa/start', [], $headers)->assertStatus(409);
        $this->assertTrue($factor->enabled($user->fresh()));
        $this->assertSame($fresh->two_factor_secret, $user->fresh()->two_factor_secret);
    }

    public static function securityMutations(): array
    {
        return array_map(fn ($operation) => [$operation], ['confirm', 'recovery', 'disable', 'logout', 'sessions', 'device']);
    }

    #[DataProvider('securityMutations')]
    public function test_security_mutation_rolls_back_if_durable_disconnect_cannot_be_written(string $operation): void
    {
        [$user, $app, $grant, $headers] = $this->connected();
        $factor = app(TwoFactor::class); $secret = $factor->start($user); $totp = app(Totp::class);
        $code = $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD));
        if ($operation !== 'confirm') $code = $factor->confirm($user, $code)[0];
        $before = $user->fresh()->only(['two_factor_secret', 'two_factor_confirmed_at', 'two_factor_recovery_codes', 'two_factor_last_slot']);
        $deviceId = $this->getJson('/api/account/sessions', $headers)->assertOk()->json('devices.0.id');
        $this->mock(RemoteSessionRevocations::class)->shouldReceive('queue')->once()->andThrow(new \RuntimeException('outbox unavailable'));
        $this->withoutExceptionHandling();
        try {
            match ($operation) {
                'disable' => $this->deleteJson('/api/account/2fa', ['code' => $code], $headers),
                'logout' => $this->deleteJson('/api/auth/logout', [], $headers),
                'sessions' => $this->deleteJson('/api/account/sessions', [], $headers),
                'device' => $this->deleteJson('/api/account/devices/'.$deviceId, [], $headers),
                default => $this->postJson('/api/account/2fa/'.$operation, ['code' => $code], $headers),
            };
            $this->fail('A failed outbox write must abort the security mutation.');
        } catch (\RuntimeException $error) {
            $this->assertSame('outbox unavailable', $error->getMessage());
        }
        $this->assertSame($before, $user->fresh()->only(array_keys($before)));
        $this->assertNull($app->fresh()->revoked_at);
        $this->assertDatabaseHas('remote_sessions', ['grant_id' => $grant['sessionId'], 'revoked_at' => null]);
        $this->assertDatabaseCount('remote_session_revocations', 0);
        $this->assertSame(0, (int) DB::table('remote_hosts')->value('reset_revision'));
    }
}
