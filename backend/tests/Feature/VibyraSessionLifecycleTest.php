<?php

namespace Tests\Feature;

use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class VibyraSessionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_new_sessions_receive_idle_and_absolute_deadlines(): void
    {
        Carbon::setTestNow('2026-06-09 12:00:00');
        config([
            'session_security.idle_minutes' => 10,
            'session_security.absolute_minutes' => 60,
        ]);

        $token = $this->signup();
        $session = VibyraSession::firstOrFail();
        $this->assertSame('2026-06-09 12:10:00', $session->idle_expires_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-06-09 13:00:00', $session->absolute_expires_at->format('Y-m-d H:i:s'));

        Carbon::setTestNow('2026-06-09 12:05:00');
        $this->getJson('/api/session', $this->headers($token))->assertOk();
        $this->assertSame(
            '2026-06-09 12:15:00',
            $session->fresh()->idle_expires_at->format('Y-m-d H:i:s')
        );
    }

    public function test_idle_expiry_revokes_the_session_with_metadata(): void
    {
        config(['session_security.lifecycle_mode' => 'enforce']);
        $token = $this->signup();
        $session = VibyraSession::firstOrFail();
        $session->forceFill(['idle_expires_at' => now()->subSecond()])->save();

        $this->getJson('/api/session', $this->headers($token))->assertUnauthorized();

        $session->refresh();
        $this->assertNotNull($session->revoked_at);
        $this->assertSame('idle_expired', $session->revocation_reason);
    }

    public function test_absolute_expiry_cannot_be_extended_by_activity(): void
    {
        config(['session_security.lifecycle_mode' => 'enforce']);
        $token = $this->signup();
        $session = VibyraSession::firstOrFail();
        $session->forceFill([
            'idle_expires_at' => now()->addHour(),
            'absolute_expires_at' => now()->subSecond(),
        ])->save();

        $this->getJson('/api/session', $this->headers($token))->assertUnauthorized();

        $session->refresh();
        $this->assertSame('absolute_expired', $session->revocation_reason);
    }

    public function test_observe_mode_records_activity_without_rejecting_expired_sessions(): void
    {
        config(['session_security.lifecycle_mode' => 'observe']);
        $token = $this->signup();
        $session = VibyraSession::firstOrFail();
        $session->forceFill(['idle_expires_at' => now()->subSecond()])->save();

        $this->getJson('/api/session', $this->headers($token))->assertOk();

        $this->assertNull($session->fresh()->revoked_at);
    }

    public function test_current_session_logout_preserves_revocation_metadata(): void
    {
        $token = $this->signup();

        $this->deleteJson('/api/auth/logout', [], $this->headers($token))
            ->assertOk()
            ->assertJsonPath('ok', true);
        $this->getJson('/api/session', $this->headers($token))->assertUnauthorized();

        $session = VibyraSession::firstOrFail();
        $this->assertSame('logout', $session->revocation_reason);
        $this->assertNotNull($session->revoked_at);
    }

    public function test_manual_rotation_returns_a_new_token_with_a_short_previous_token_grace(): void
    {
        Carbon::setTestNow('2026-06-09 12:00:00');
        config([
            'session_security.rotation_mode' => 'manual',
            'session_security.previous_token_grace_seconds' => 30,
        ]);
        $oldToken = $this->signup();

        $rotation = $this->postJson('/api/auth/session/rotate', [], $this->headers($oldToken))
            ->assertOk()
            ->assertJsonPath('previousTokenGraceSeconds', 30);
        $newToken = $rotation->json('token');
        $this->assertNotSame($oldToken, $newToken);

        $this->getJson('/api/session', $this->headers($oldToken))->assertOk();
        $this->postJson('/api/auth/session/rotate', [], $this->headers($oldToken))->assertConflict();
        $this->getJson('/api/session', $this->headers($newToken))->assertOk();

        Carbon::setTestNow('2026-06-09 12:00:31');
        $this->getJson('/api/session', $this->headers($oldToken))->assertUnauthorized();
        $this->getJson('/api/session', $this->headers($newToken))->assertOk();
    }

    private function signup(): string
    {
        return $this->postJson('/api/auth/signup', [
            'name' => 'Session Owner',
            'email' => 'session-owner@example.com',
            'password' => 'secret123',
            'deviceName' => 'Vibyra App',
            'installId' => 'session-test-device',
        ])->assertCreated()->json('token');
    }

    private function headers(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }
}
