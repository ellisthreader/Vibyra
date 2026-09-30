<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Notification, Queue, RateLimiter};
use Tests\TestCase;

/**
 * Each auth route counts on its own. An unnamed `throttle:` limit keys only on the
 * caller's address, so every unnamed limit shared one counter: a guest polling the
 * Vibes wallet (90 a minute) had spent sign-up's five and log-in's ten before either
 * was pressed, and the phone's Create account answered 429.
 */
class AuthThrottleSeparationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'vibes.guests_enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Notification::fake();
        RateLimiter::clear('vibes-guest:'.hash('sha256', '127.0.0.1'));
    }

    public function test_a_guest_polling_vibes_can_still_sign_up_and_log_in(): void
    {
        $token = $this->postJson('/api/vibes/guest', ['installId' => 'install-throttle'])->assertOk()->json('token');
        for ($i = 0; $i < 12; $i++) {
            $this->getJson('/api/vibes/wallet', ['Authorization' => "Bearer {$token}"])->assertOk();
        }
        $this->postJson('/api/auth/signup', ['name' => 'Guest Person', 'email' => 'guest-throttle@example.com',
            'password' => 'secret123'], ['Authorization' => "Bearer {$token}"])->assertSuccessful();
        $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'guest-throttle@example.com',
            'password' => 'secret123'])->assertOk();
    }

    public function test_a_guest_polling_vibes_can_still_start_apple_sign_in_and_poll_a_browser_sign_in(): void
    {
        // The native Apple sheet starts with a challenge (12 a minute), and deleting an
        // Apple account does too; Google polls its flow's status every 1.5 seconds.
        $token = $this->postJson('/api/vibes/guest', ['installId' => 'install-provider'])->assertOk()->json('token');
        for ($i = 0; $i < 14; $i++) {
            $this->getJson('/api/vibes/wallet', ['Authorization' => "Bearer {$token}"])->assertOk();
        }
        $this->postJson('/api/auth/provider/challenge', ['provider' => 'apple'])->assertOk();
        $this->assertNotSame(429, $this->getJson('/api/auth/desktop/google/status/'.str_repeat('a', 43))->status());
        // The connect flow's "email me the download link" (6 a minute) is asked signed out too.
        $this->assertNotSame(429, $this->postJson('/api/account/host-link', ['email' => 'guest-link@example.com'])->status());
        for ($i = 0; $i < 11; $i++) {
            $this->postJson('/api/auth/provider/challenge', ['provider' => 'apple'])->assertOk();
        }
        $this->postJson('/api/auth/provider/challenge', ['provider' => 'apple'])->assertStatus(429);
    }

    public function test_each_auth_limit_still_trips_on_its_own(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/signup', ['name' => 'Person', 'email' => "person{$i}@example.com", 'password' => 'secret123'])->assertSuccessful();
        }
        $this->postJson('/api/auth/signup', ['name' => 'Person', 'email' => 'person9@example.com', 'password' => 'secret123'])->assertStatus(429);

        // Sign-up's five are spent; log-in still has all ten of its own.
        $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'person0@example.com', 'password' => 'secret123'])->assertOk();
        for ($i = 1; $i < 10; $i++) {
            $status = $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'person0@example.com', 'password' => 'wrong-one'])->status();
            $this->assertNotSame(429, $status, "log-in attempt {$i} is within its own ten");
        }
        $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'person0@example.com', 'password' => 'secret123'])->assertStatus(429);

        // The two email routes have their own five each.
        for ($i = 0; $i < 5; $i++) {
            $this->assertNotSame(429, $this->postJson('/api/auth/password/forgot', ['email' => 'person1@example.com'])->status());
        }
        $this->postJson('/api/auth/password/forgot', ['email' => 'person1@example.com'])->assertStatus(429);
        $this->assertNotSame(429, $this->postJson('/api/auth/email/resend', ['email' => 'person1@example.com'])->status(),
            'resend is not spent by the password route');
    }
}
