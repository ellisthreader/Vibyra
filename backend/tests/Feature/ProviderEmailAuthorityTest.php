<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\ProviderAccountException;
use App\Services\Auth\ProviderAccountService;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use App\Services\Auth\TwoFactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProviderEmailAuthorityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('a', 32))]);
    }

    #[DataProvider('emailClaims')]
    public function test_signed_provider_email_cannot_bypass_account_identity(
        string $provider, string $email, mixed $verified, mixed $hd,
        bool $accountVerified, bool $twoFactor, bool $allowed
    ): void {
        $user = User::factory()->create([
            'provider' => 'email', 'provider_id' => null, 'email' => $email,
            'email_verified_at' => $accountVerified ? now() : null,
        ]);
        if ($twoFactor) {
            app(TwoFactor::class)->start($user);
            $user->forceFill(['two_factor_confirmed_at' => now()])->save();
        }
        $originalPassword = $user->password;
        $claims = [
            'iss' => $provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
            'aud' => 'authority-test', 'sub' => 'new-provider-subject',
            'email' => $email, 'iat' => time(), 'exp' => time() + 300,
        ];
        if ($verified !== null) $claims['email_verified'] = $verified;
        if ($hd !== null) $claims['hd'] = $hd;
        [$token, $jwk] = $this->signedToken($claims);
        Cache::flush();
        config([
            "services.{$provider}_auth.audiences" => ['authority-test'],
            "services.{$provider}_auth.jwks_url" => "https://{$provider}.test/keys",
        ]);
        Http::fake(["https://{$provider}.test/keys" => Http::response(['keys' => [$jwk]])]);

        $resolved = null;
        try {
            $identity = app(ProviderIdentityVerifier::class)->verify($provider, $token);
            $resolved = app(ProviderAccountService::class)->resolveWithStatus(Request::create('/', 'POST', [
                'termsVersion' => config('legal.terms_version'), 'termsAccepted' => true,
                'adultConfirmed' => true, 'countryCode' => 'GB',
            ]), $provider, $identity);
        } catch (ProviderIdentityException|ProviderAccountException $exception) {
            $this->assertFalse($allowed, $exception->getMessage());
        }
        if ($allowed) {
            $this->assertSame($user->id, $resolved['user']->id);
            $this->assertFalse($resolved['created']);
        } else {
            $this->assertTrue($resolved === null, 'Untrusted provider email must not select an existing account.');
        }
        $this->assertSame(1, User::count());
        $this->assertSame('email', $user->fresh()->provider);
        $this->assertNull($user->fresh()->provider_id);
        $this->assertSame($originalPassword, $user->fresh()->password);
    }

    public static function emailClaims(): array
    {
        return [
            'external Google mailbox' => ['google', 'owner@example.com', true, null, true, false, false],
            'empty hosted domain' => ['google', 'owner@example.com', true, ' ', true, false, false],
            'malformed hosted domain' => ['google', 'owner@example.com', true, [], true, false, false],
            'lookalike Gmail domain' => ['google', 'owner@gmail.com.example.com', true, null, true, false, false],
            'Google Gmail' => ['google', 'owner@gmail.com', true, null, true, false, true],
            'Google Workspace' => ['google', 'owner@example.com', true, 'example.com', true, false, true],
            'missing Google verification' => ['google', 'owner@gmail.com', null, null, true, false, false],
            'unverified Google Workspace' => ['google', 'owner@example.com', false, 'example.com', true, false, false],
            'unverified account Gmail' => ['google', 'owner@gmail.com', true, null, false, false, false],
            '2FA account Gmail' => ['google', 'owner@gmail.com', true, null, true, true, false],
            'unverified account Workspace' => ['google', 'owner@example.com', true, 'example.com', false, false, false],
            '2FA account Workspace' => ['google', 'owner@example.com', true, 'example.com', true, true, false],
            'verified Apple' => ['apple', 'owner@example.com', 'true', null, true, false, true],
            'unverified Apple' => ['apple', 'owner@example.com', false, null, true, false, false],
            'missing Apple verification' => ['apple', 'owner@example.com', null, null, true, false, false],
            'unverified account Apple' => ['apple', 'owner@example.com', true, null, false, false, false],
            '2FA account Apple' => ['apple', 'owner@example.com', true, null, true, true, false],
        ];
    }

    private function signedToken(array $claims): array
    {
        $privateKey = openssl_pkey_new(self::openSslOptions([
            'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]));
        $details = openssl_pkey_get_details($privateKey);
        $encode = fn (string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
        $jwk = [
            'kty' => 'RSA', 'kid' => 'authority-test',
            'n' => $encode($details['rsa']['n']), 'e' => $encode($details['rsa']['e']),
        ];
        $header = $encode(json_encode(['alg' => 'RS256', 'kid' => 'authority-test']));
        $payload = $encode(json_encode($claims));
        openssl_sign("{$header}.{$payload}", $signature, $privateKey, OPENSSL_ALGO_SHA256);

        return ["{$header}.{$payload}.".$encode($signature), $jwk];
    }
}
