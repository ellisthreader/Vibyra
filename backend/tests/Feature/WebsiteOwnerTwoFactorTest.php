<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\Totp;
use App\Services\Auth\TwoFactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class WebsiteOwnerTwoFactorTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_does_not_open_owner_session_when_two_factor_is_enabled(): void
    {
        config(['owner_analytics.emails' => ['owner@example.test']]);
        $user = User::factory()->create([
            'email' => 'owner@example.test', 'password' => 'secret123',
            'email_verified_at' => now(),
        ]);
        $secret = app(TwoFactor::class)->start($user);
        $totp = app(Totp::class);
        $slot = intdiv(time(), Totp::PERIOD);
        $this->assertNotNull(app(TwoFactor::class)->confirm($user,
            $totp->at($totp->decode($secret), $slot)));

        $login = $this->postJson('/web-api/auth/login', [
            'email' => $user->email, 'password' => 'secret123',
        ])->assertOk()->assertJsonMissingPath('user');
        $this->assertFalse(Auth::check());
        $challenge = (string) $login->json('twoFactor.challengeId');
        $this->postJson('/web-api/auth/login/2fa', [
            'challengeId' => $challenge, 'code' => '000000',
        ])->assertUnauthorized();
        $this->postJson('/web-api/auth/login/2fa', [
            'challengeId' => $challenge,
            'code' => $totp->at($totp->decode($secret), $slot + 1),
        ])->assertOk()->assertJsonPath('user.email', $user->email);
        $this->get('/owner')->assertOk();
    }
}
