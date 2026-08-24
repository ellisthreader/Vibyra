<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthRateLimitIsolationTest extends TestCase
{
    use RefreshDatabase;

    private const CLIENT_IP = '203.0.113.42';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Notification::fake();
        config([
            'services.google_desktop_oauth.client_id' => 'google-desktop-client',
            'services.google_desktop_oauth.redirect_uri' => 'https://vibyra.test/api/auth/desktop/google/callback',
        ]);
    }

    public function test_google_polling_does_not_throttle_its_callback(): void
    {
        $this->pollPendingGoogleFlow();

        $this->fromClient()->get('/api/auth/desktop/google/callback?state=invalid&code=invalid')
            ->assertStatus(400);
    }

    public function test_google_polling_does_not_throttle_first_email_signup(): void
    {
        $this->pollPendingGoogleFlow();

        $this->fromClient()->postJson('/api/auth/signup', [
            'name' => 'First Signup',
            'email' => 'first-signup@example.com',
            'password' => 'correct-horse-battery-staple',
            'installId' => 'desktop-installation',
            'deviceName' => 'Customer PC',
        ])->assertCreated()->assertJsonPath('ok', true);
    }

    public function test_website_google_polling_does_not_throttle_first_signup(): void
    {
        $start = $this->fromClient()
            ->postJson('/web-api/auth/provider/google/start')
            ->assertOk()
            ->json();
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $this->fromClient()
                ->getJson("/web-api/auth/provider/google/status/{$start['flowId']}")
                ->assertOk()
                ->assertJsonPath('status', 'pending');
        }

        $this->fromClient()->postJson('/web-api/auth/signup', [
            'name' => 'Website Signup',
            'email' => 'website-signup@example.com',
            'password' => 'correct-horse-battery-staple',
        ])->assertCreated()->assertJsonPath('ok', true);
    }

    public function test_repeated_signup_attempts_are_still_limited(): void
    {
        $payload = [
            'email' => 'limited-signup@example.com',
            'password' => 'short',
            'installId' => 'limited-installation',
        ];
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->fromClient()->postJson('/api/auth/signup', $payload)->assertUnprocessable();
        }

        $this->fromClient()->postJson('/api/auth/signup', $payload)
            ->assertStatus(429)
            ->assertJsonPath('ok', false)
            ->assertJsonStructure(['error', 'retryAfter']);
    }

    public function test_signup_limit_does_not_group_different_people_on_one_ip(): void
    {
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->fromClient()->postJson('/api/auth/signup', [
                'email' => "shared-network-{$attempt}@example.com",
                'password' => 'short',
                'installId' => "shared-network-installation-{$attempt}",
            ])->assertUnprocessable();
        }
    }

    private function pollPendingGoogleFlow(): void
    {
        $start = $this->fromClient()->postJson('/api/auth/desktop/google/start', [
            'installId' => 'desktop-installation',
            'deviceName' => 'Customer PC',
        ])->assertOk()->json();

        for ($attempt = 0; $attempt < 35; $attempt++) {
            $this->fromClient()
                ->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
                ->assertOk()
                ->assertJsonPath('status', 'pending');
        }
    }

    private function fromClient(): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => self::CLIENT_IP]);
    }
}
