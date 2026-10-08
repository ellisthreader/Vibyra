<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebsiteAuthValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_rejects_non_string_credentials_as_validation_errors(): void
    {
        $this->postJson('/web-api/auth/login', [
            'email' => ['member@example.test'], 'password' => ['secret123'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
        $this->assertGuest();
    }

    public function test_second_factor_rejects_non_string_challenge_and_code(): void
    {
        $this->postJson('/web-api/auth/login/2fa', [
            'challengeId' => ['invalid'], 'code' => ['123456'],
        ])->assertUnprocessable()->assertJsonValidationErrors(['challengeId', 'code']);
        $this->assertGuest();
    }

    public function test_signup_rejects_non_string_invite_codes_without_creating_an_account(): void
    {
        foreach (['referralCode', 'ref'] as $field) {
            $this->postJson('/web-api/auth/signup', [
                'email' => 'invite@example.test', 'password' => 'secret123',
                $field => ['invalid'],
            ])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_signup']);
        $this->assertGuest();
    }
}
