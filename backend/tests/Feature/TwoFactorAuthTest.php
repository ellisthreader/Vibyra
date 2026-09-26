<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\Totp;
use App\Services\Auth\TwoFactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The second factor end to end: setting it up, the login it then gates, the codes
 * that get somebody back in without their phone, and turning it off again.
 *
 * The clock is not slept through. Codes are computed for the slot the server is in,
 * exactly as an authenticator app would, so these cases prove the arithmetic rather
 * than waiting thirty seconds to find out.
 */
class TwoFactorAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Notification::fake();
    }

    private function account(): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'email' => 'ellis@example.com', 'password' => 'secret123', 'deviceName' => 'iPhone',
        ])->assertSuccessful()->json('token');

        return [User::where('email', 'ellis@example.com')->firstOrFail(), $token];
    }

    private function codeFor(User $user, int $drift = 0): string
    {
        $totp = app(Totp::class);
        $secret = Crypt::decryptString((string) $user->fresh()->two_factor_secret);

        return $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD) + $drift);
    }

    private function turnOn(): array
    {
        [$user, $token] = $this->account();
        $start = $this->postJson('/api/account/2fa/start', [], ['Authorization' => "Bearer {$token}"])->assertOk();
        $codes = $this->postJson('/api/account/2fa/confirm', ['code' => $this->codeFor($user)],
            ['Authorization' => "Bearer {$token}"])->assertOk()->json('recoveryCodes');

        return [$user->fresh(), $token, $start->json(), $codes];
    }

    public function test_setup_hands_back_a_link_the_authenticator_app_can_read(): void
    {
        [$user, $token] = $this->account();
        $start = $this->postJson('/api/account/2fa/start', [], ['Authorization' => "Bearer {$token}"])->assertOk();
        $uri = (string) $start->json('uri');
        $this->assertStringStartsWith('otpauth://totp/Vibyra:ellis%40example.com?', $uri);
        parse_str(parse_url($uri, PHP_URL_QUERY), $query);
        $this->assertSame($start->json('secret'), $query['secret'], 'the link carries the secret the page shows');
        $this->assertSame(['SHA1', '6', '30'], [$query['algorithm'], $query['digits'], $query['period']]);
        $this->assertMatchesRegularExpression('/^[A-Z2-7]{32}$/', (string) $start->json('secret'));
        // Nothing is gated until the first code proves the app and the server agree.
        $this->assertFalse(app(TwoFactor::class)->enabled($user->fresh()));
        $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'ellis@example.com', 'password' => 'secret123'])
            ->assertOk()->assertJsonMissingPath('twoFactor');
    }

    public function test_a_wrong_first_code_leaves_it_off(): void
    {
        [, $token] = $this->account();
        $this->postJson('/api/account/2fa/start', [], ['Authorization' => "Bearer {$token}"])->assertOk();
        $this->postJson('/api/account/2fa/confirm', ['code' => '000000'], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)->assertJsonPath('ok', false);
        $this->getJson('/api/account/2fa', ['Authorization' => "Bearer {$token}"])->assertOk()->assertJsonPath('enabled', false);
    }

    public function test_confirming_returns_recovery_codes_and_says_the_account_is_protected(): void
    {
        [$user, $token, , $codes] = $this->turnOn();
        $this->assertCount(TwoFactor::RECOVERY_CODES, $codes);
        $this->assertCount(TwoFactor::RECOVERY_CODES, array_unique($codes));
        foreach ($codes as $code) {
            $this->assertMatchesRegularExpression('/^[a-z2-9]{5}-[a-z2-9]{5}$/', $code);
        }
        $this->assertTrue(app(TwoFactor::class)->enabled($user->fresh()));
        $this->getJson('/api/session', ['Authorization' => "Bearer {$token}"])->assertOk()
            ->assertJsonPath('user.twoFactorEnabled', true);
        $this->getJson('/api/account/2fa', ['Authorization' => "Bearer {$token}"])->assertOk()
            ->assertJsonPath('enabled', true)->assertJsonPath('recoveryCodesLeft', TwoFactor::RECOVERY_CODES);
    }

    public function test_the_password_alone_no_longer_signs_in(): void
    {
        [$user] = $this->turnOn();
        $login = $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'ellis@example.com',
            'password' => 'secret123', 'deviceName' => 'iPhone'])->assertOk();
        $login->assertJsonMissingPath('token');
        $challenge = (string) $login->json('twoFactor.challengeId');
        $this->assertNotSame('', $challenge);

        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => '111111'])->assertStatus(401);
        // The slot the setup was confirmed with is already spent, so this is the next one.
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $this->codeFor($user, 1), 'deviceName' => 'iPhone'])
            ->assertOk()->assertJsonPath('user.email', 'ellis@example.com')->assertJsonStructure(['token']);
    }

    public function test_a_code_from_the_slot_either_side_is_accepted_and_a_stale_one_is_not(): void
    {
        [$user] = $this->turnOn();
        $start = fn () => (string) $this->postJson('/api/auth/login', ['provider' => 'email',
            'email' => 'ellis@example.com', 'password' => 'secret123'])->json('twoFactor.challengeId');
        // The confirmation already spent the current slot, so the next one is what is left.
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $start(), 'code' => $this->codeFor($user, 1)])->assertOk();
        // A slot at or before the last one used is refused: a code is good exactly once.
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $start(), 'code' => $this->codeFor($user, 1)])->assertStatus(401);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $start(), 'code' => $this->codeFor($user, -10)])->assertStatus(401);
    }

    public function test_a_recovery_code_signs_in_once_and_is_then_spent(): void
    {
        [, $token, , $codes] = $this->turnOn();
        $challenge = fn () => (string) $this->postJson('/api/auth/login', ['provider' => 'email',
            'email' => 'ellis@example.com', 'password' => 'secret123'])->json('twoFactor.challengeId');
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge(), 'code' => $codes[0]])->assertOk();
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge(), 'code' => $codes[0]])->assertStatus(401);
        $this->getJson('/api/account/2fa', ['Authorization' => "Bearer {$token}"])
            ->assertOk()->assertJsonPath('recoveryCodesLeft', TwoFactor::RECOVERY_CODES - 1);
    }

    public function test_a_challenge_stops_taking_guesses(): void
    {
        [$user] = $this->turnOn();
        $challenge = (string) $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'ellis@example.com',
            'password' => 'secret123'])->json('twoFactor.challengeId');
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => '000000'])->assertStatus(401);
        }
        // Spent: even the right code cannot rescue this challenge, only the password again.
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $this->codeFor($user, 1)])->assertStatus(401);
    }

    public function test_turning_it_off_takes_a_code_not_just_the_session(): void
    {
        [$user, $token] = $this->turnOn();
        $this->deleteJson('/api/account/2fa', ['code' => '000000'], ['Authorization' => "Bearer {$token}"])->assertStatus(422);
        $this->assertTrue(app(TwoFactor::class)->enabled($user->fresh()));
        $this->deleteJson('/api/account/2fa', ['code' => $this->codeFor($user, 1)], ['Authorization' => "Bearer {$token}"])
            ->assertOk()->assertJsonPath('user.twoFactorEnabled', false);
        $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'ellis@example.com', 'password' => 'secret123'])
            ->assertOk()->assertJsonStructure(['token']);
    }

    public function test_new_recovery_codes_replace_the_old_ones(): void
    {
        [$user, $token, , $codes] = $this->turnOn();
        $this->postJson('/api/account/2fa/recovery', ['code' => '000000'], ['Authorization' => "Bearer {$token}"])->assertStatus(422);
        $fresh = $this->postJson('/api/account/2fa/recovery', ['code' => $this->codeFor($user, 1)],
            ['Authorization' => "Bearer {$token}"])->assertOk()->json('recoveryCodes');
        $this->assertCount(TwoFactor::RECOVERY_CODES, $fresh);
        $this->assertSame([], array_intersect($codes, $fresh), 'none of the old codes still work');
    }

    public function test_the_website_asks_the_same_second_question(): void
    {
        [$user] = $this->turnOn();
        // Without this the second factor would guard the phone and the website would
        // still open on the password alone, which is the same account either way.
        $login = $this->postJson('/web-api/auth/login', ['email' => 'ellis@example.com', 'password' => 'secret123'])->assertOk();
        $login->assertJsonMissingPath('user');
        $this->getJson('/web-api/session')->assertStatus(401);

        $challenge = (string) $login->json('twoFactor.challengeId');
        $this->postJson('/web-api/auth/login/2fa', ['challengeId' => $challenge, 'code' => '000000'])->assertStatus(401);
        $this->postJson('/web-api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $this->codeFor($user, 1)])
            ->assertOk()->assertJsonPath('user.email', 'ellis@example.com');
        $this->getJson('/web-api/session')->assertOk();
    }

    public function test_a_provider_account_is_told_where_its_second_step_belongs(): void
    {
        [$user, $token] = $this->account();
        $user->forceFill(['provider' => 'google', 'provider_id' => 'google-1'])->save();
        $this->postJson('/api/account/2fa/start', [], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)->assertJsonPath('ok', false);
        $this->getJson('/api/account/2fa', ['Authorization' => "Bearer {$token}"])->assertOk()
            ->assertJsonPath('available', false)->assertJsonPath('enabled', false);
    }
}
