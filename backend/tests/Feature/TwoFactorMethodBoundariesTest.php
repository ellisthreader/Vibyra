<?php

namespace Tests\Feature;

use App\Services\Auth\{Totp, TwoFactor, TwoFactorChallenge};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class TwoFactorMethodBoundariesTest extends TestCase
{
    use RefreshDatabase, \Tests\Support\TwoFactorMethodsFixture;

    public function test_switching_keeps_old_factor_until_new_destination_is_proved_and_invalidates_old_login(): void
    {
        [$user, , $headers, $recovery] = $this->enroll('email');
        $oldLogin = $this->login()->json('twoFactor.challengeId');
        $oldCode = $this->sentCode('email');
        $this->postJson('/api/account/2fa/method/start', ['method' => 'sms', 'phoneNumber' => '+447700900123'], $headers)->assertStatus(422);
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'sms', 'phoneNumber' => '+447700900123', 'currentCode' => $recovery[0]], $headers)->assertOk()->json();
        $this->assertSame('email', $user->fresh()->two_factor_method);
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => '000000'], $headers)->assertStatus(422);
        $this->assertSame('email', $user->fresh()->two_factor_method);
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $this->sentCode('sms')], $headers)->assertOk();
        $this->assertSame('sms', $user->fresh()->two_factor_method);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $oldLogin, 'code' => $oldCode])->assertUnauthorized();
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $this->sentCode('sms')], $headers)->assertStatus(422);
    }

    public function test_sms_can_be_replaced_with_authenticator_and_recovery_codes_are_rotated(): void
    {
        [$user, , $headers, $oldCodes] = $this->enroll('sms');
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'totp', 'currentCode' => $oldCodes[0]], $headers)->assertOk()->json();
        $totp = app(Totp::class); $code = $totp->at($totp->decode($setup['secret']), intdiv(time(), Totp::PERIOD));
        $new = $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $code], $headers)->assertOk()->json('recoveryCodes');
        $this->assertSame('totp', $user->fresh()->two_factor_method);
        $this->assertSame([], array_intersect($oldCodes, $new));
        $this->assertFalse(app(TwoFactor::class)->check($user, $code));
        $this->assertFalse(app(TwoFactor::class)->check($user, $oldCodes[1]));
    }

    public function test_resend_retires_old_code_and_never_resets_guesses_or_extends_login(): void
    {
        $this->enroll('email'); $id = $this->login()->json('twoFactor.challengeId'); $old = $this->sentCode('email');
        $this->postJson('/api/auth/login/2fa/code', ['challengeId' => $id, 'send' => true])->assertStatus(503);
        $this->travel(61)->seconds();
        $this->postJson('/api/auth/login/2fa/code', ['challengeId' => $id, 'send' => true])->assertOk();
        $new = $this->sentCode('email'); $this->assertNotSame($old, $new);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $old])->assertUnauthorized();
        for ($at = 0; $at < 4; $at++) $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => '000000'])->assertUnauthorized();
        $this->travel(61)->seconds();
        $this->postJson('/api/auth/login/2fa/code', ['challengeId' => $id, 'send' => true])->assertUnauthorized();
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $new])->assertUnauthorized();
    }

    public function test_expired_challenges_setups_and_other_session_confirmations_fail(): void
    {
        [, , $headers] = $this->account();
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'email'], $headers)->assertOk()->json();
        $code = $this->sentCode('email');
        $other = $this->login()->json('token');
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $code], ['Authorization' => 'Bearer '.$other])->assertStatus(422);
        $this->travel(301)->seconds();
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $code], $headers)->assertStatus(422);
    }

    public function test_setup_resend_is_actor_bound_rotates_code_and_preserves_attempts(): void
    {
        [, , $headers] = $this->account();
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'email'], $headers)->assertOk()->json();
        $old = $this->sentCode('email'); $body = ['enrollmentId' => $setup['enrollmentId']];
        $other = ['Authorization' => 'Bearer '.$this->login()->json('token')];
        $this->postJson('/api/account/2fa/method/code', $body, $other)->assertStatus(422);
        $this->postJson('/api/account/2fa/method/code', $body, $headers)->assertStatus(422);
        $this->travel(61)->seconds();
        $this->postJson('/api/account/2fa/method/code', $body, $headers)->assertOk();
        $new = $this->sentCode('email'); $this->assertNotSame($old, $new);
        $this->postJson('/api/account/2fa/method/confirm', [...$body, 'code' => $old], $headers)->assertStatus(422);
        for ($at = 0; $at < 4; $at++) $this->postJson('/api/account/2fa/method/confirm', [...$body, 'code' => '000000'], $headers)->assertStatus(422);
        $this->travel(61)->seconds();
        $this->postJson('/api/account/2fa/method/code', $body, $headers)->assertStatus(422);
        $this->postJson('/api/account/2fa/method/confirm', [...$body, 'code' => $new], $headers)->assertStatus(422);
    }

    public function test_corrupted_authenticator_never_accepts_a_code_for_an_empty_secret(): void
    {
        [$user, , $headers, $recovery] = $this->enroll('sms');
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'totp', 'currentCode' => $recovery[0]], $headers)->assertOk()->json();
        $totp = app(Totp::class); $slot = intdiv(time(), Totp::PERIOD);
        $codes = $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'],
            'code' => $totp->at($totp->decode($setup['secret']), $slot)], $headers)->assertOk()->json('recoveryCodes');
        $user->forceFill(['two_factor_secret' => 'damaged-ciphertext'])->save();
        $this->assertTrue(app(TwoFactor::class)->enabled($user->fresh()));
        $login = $this->login(); $login->assertJsonMissingPath('token');
        $id = $login->json('twoFactor.challengeId');
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $totp->at('', $slot + 1)])->assertUnauthorized();
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $codes[0]])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_corrupted_delivery_destination_never_bypasses_two_factor(): void
    {
        [$user, , , $recovery] = $this->enroll('email');
        $user->forceFill(['two_factor_destination' => 'damaged-ciphertext'])->save();
        $this->assertTrue(app(TwoFactor::class)->enabled($user->fresh()));
        $login = $this->login(); $login->assertJsonMissingPath('token');
        $id = $login->json('twoFactor.challengeId');
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $recovery[0]])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_account_identity_change_invalidates_setup_and_delivery_challenge(): void
    {
        [$user, , $headers, $recovery] = $this->enroll('email');
        $id = $this->login()->json('twoFactor.challengeId');
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => 'sms', 'phoneNumber' => '+447700900123', 'currentCode' => $recovery[0]], $headers)->assertOk()->json();
        $user->forceFill(['password' => 'replacement-password'])->save();
        $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $this->sentCode('sms')], $headers)->assertStatus(422);
        $this->assertNull(app(TwoFactorChallenge::class)->delivery($id, true));
    }
}
