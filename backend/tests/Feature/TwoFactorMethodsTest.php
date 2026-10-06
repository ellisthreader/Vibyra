<?php

namespace Tests\Feature;

use App\Services\Auth\{TwoFactor, TwoFactorChallenge};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, Http};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TwoFactorMethodsTest extends TestCase
{
    use RefreshDatabase, \Tests\Support\TwoFactorMethodsFixture;
    public static function methods(): array { return [['email'], ['sms']]; }
    public static function partialKeys(): array { return [['SK'.str_repeat('b', 32), ''], ['', 'synthetic-secret']]; }

    #[DataProvider('partialKeys')]
    public function test_incomplete_api_key_pair_uses_the_complete_account_token_pair(string $key, string $secret): void
    {
        config(['services.twilio_sms.api_key' => $key, 'services.twilio_sms.api_secret' => $secret,
            'services.twilio_sms.auth_token' => 'synthetic-token']);
        app(\App\Services\Auth\TwoFactorDelivery::class)->send('sms', '+447700900123', '123456');
        Http::assertSentCount(1);
        $expected = 'Basic '.base64_encode('AC'.str_repeat('a', 32).':synthetic-token');
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', $expected));
    }

    public function test_complete_api_key_pair_is_used_together(): void
    {
        config(['services.twilio_sms.auth_token' => 'synthetic-token']);
        app(\App\Services\Auth\TwoFactorDelivery::class)->send('sms', '+447700900123', '123456');
        Http::assertSentCount(1);
        $expected = 'Basic '.base64_encode('SK'.str_repeat('b', 32).':synthetic-secret');
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', $expected));
    }

    #[DataProvider('methods')]
    public function test_setup_login_one_time_codes_and_recovery(string $method): void
    {
        [$user, , $headers, $recovery] = $this->enroll($method);
        $this->assertTrue(app(TwoFactor::class)->enabled($user));
        $this->assertSame($method, $user->two_factor_method);
        $this->assertNull($user->two_factor_secret);
        $this->assertNotSame('methods@example.com', $user->two_factor_destination);
        $this->getJson('/api/account/2fa', $headers)->assertOk()->assertJsonPath('method', $method)->assertJsonPath('enabled', true);
        $login = $this->login()->assertJsonMissingPath('token')->assertJsonPath('twoFactor.codeSent', true);
        $id = $login->json('twoFactor.challengeId'); $code = $this->sentCode($method);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $code])->assertOk()->assertJsonStructure(['token']);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $code])->assertUnauthorized();
        $id2 = $this->login()->json('twoFactor.challengeId');
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id2, 'code' => $code])->assertUnauthorized();
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id2, 'code' => $recovery[0]])->assertOk();
    }

    #[DataProvider('methods')]
    public function test_settings_proof_cannot_be_used_for_login_and_disable_requires_proof(string $method): void
    {
        [$user, , $headers] = $this->enroll($method);
        $id = $this->login()->json('twoFactor.challengeId'); $loginCode = $this->sentCode($method);
        $this->deleteJson('/api/account/2fa', ['code' => $loginCode], $headers)->assertStatus(422);
        $this->postJson('/api/account/2fa/code', [], $headers)->assertOk(); $settingsCode = $this->sentCode($method);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $settingsCode])->assertUnauthorized();
        $this->deleteJson('/api/account/2fa', ['code' => $settingsCode], $headers)->assertOk();
        $this->assertFalse(app(TwoFactor::class)->enabled($user->fresh()));
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $id, 'code' => $loginCode])->assertUnauthorized();
        $this->login()->assertJsonStructure(['token']);
    }

    public function test_sms_uses_configured_twilio_number_and_failure_does_not_enable_it(): void
    {
        [, , $headers] = $this->account();
        $this->smsFailure = true;
        $this->postJson('/api/account/2fa/method/start', ['method' => 'sms', 'phoneNumber' => '+447700900123'], $headers)->assertStatus(422);
        Http::assertSent(fn ($r) => $r['From'] === '+447700900100' && $r['To'] === '+447700900123' && preg_match('/\d{6}/', $r['Body']));
        $this->getJson('/api/account/2fa', $headers)->assertJsonPath('enabled', false);
    }

    public function test_missing_sms_config_and_unverified_email_are_unavailable(): void
    {
        [$user, , $headers] = $this->account();
        config(['services.twilio_sms.from' => null]); $user->forceFill(['email_verified_at' => null])->save();
        $this->getJson('/api/account/2fa', $headers)->assertJsonPath('smsAvailable', false)->assertJsonPath('emailAvailable', false);
        foreach (['sms', 'email'] as $method) $this->postJson('/api/account/2fa/method/start', ['method' => $method, 'phoneNumber' => '+447700900123'], $headers)->assertStatus(422);
    }

    public function test_website_uses_the_same_email_code_gate(): void
    {
        $this->enroll('email');
        $login = $this->postJson('/web-api/auth/login', ['email' => 'methods@example.com', 'password' => 'secret123'])->assertOk();
        $this->getJson('/web-api/session')->assertUnauthorized();
        $this->postJson('/web-api/auth/login/2fa', ['challengeId' => $login->json('twoFactor.challengeId'), 'code' => $this->sentCode('email')])->assertOk();
        $this->getJson('/web-api/session')->assertOk();
    }

    public function test_google_email_match_still_requires_delivery_code(): void
    {
        [$user] = $this->enroll('email');
        $result = app(\App\Services\Auth\ProviderAccountService::class)->existingAccount('google',
            ['subject' => 'google-methods', 'email' => $user->email, 'emailVerified' => true, 'authoritativeEmail' => true], true);
        $this->assertTrue($result['requiresTwoFactor']);
        $challenge = app(TwoFactorChallenge::class)->issue($result['user']);
        $this->assertSame('email', $challenge['method']);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge['challengeId'], 'code' => $this->sentCode('email')])->assertOk();
    }
}
