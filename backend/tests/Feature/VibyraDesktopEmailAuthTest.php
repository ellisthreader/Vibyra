<?php

namespace Tests\Feature;

use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VibyraDesktopEmailAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_desktop_signup_logout_and_login_round_trip_persists_real_records(): void
    {
        $credentials = [
            'name' => 'Desktop Test User',
            'email' => 'desktop-auth@example.test',
            'password' => 'safe-test-password',
            'deviceName' => 'Vibyra Desktop',
            'installId' => 'desktop-auth-test-install',
        ];

        $signup = $this->postJson('/api/auth/signup', $credentials)
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('user.email', $credentials['email'])
            ->assertJsonPath('user.provider', 'email');
        $signupToken = $signup->json('token');

        $this->assertDatabaseHas('users', [
            'email' => $credentials['email'],
            'provider' => 'email',
        ]);
        $this->assertDatabaseHas('vibyra_sessions', [
            'device_name' => 'Vibyra Desktop',
            'device_identifier' => 'desktop-auth-test-install',
        ]);
        $this->getJson('/api/session', $this->headers($signupToken))
            ->assertOk()
            ->assertJsonPath('user.email', $credentials['email']);

        $this->deleteJson('/api/auth/logout', [], $this->headers($signupToken))->assertOk();
        $this->getJson('/api/session', $this->headers($signupToken))->assertUnauthorized();

        $login = $this->postJson('/api/auth/login', [
            'email' => $credentials['email'],
            'password' => $credentials['password'],
            'deviceName' => $credentials['deviceName'],
            'installId' => $credentials['installId'],
        ])->assertOk()->assertJsonPath('user.email', $credentials['email']);
        $loginToken = $login->json('token');

        $this->assertNotSame($signupToken, $loginToken);
        $this->getJson('/api/session', $this->headers($loginToken))->assertOk();
        $this->assertSame(1, VibyraSession::query()->whereNull('revoked_at')->count());
    }

    private function headers(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }
}
