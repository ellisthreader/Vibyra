<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraProviderAuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_google_login_verifies_signed_identity_token_and_creates_verified_user(): void
    {
        [$token, $jwk] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-client',
            'sub' => 'google-user-1',
            'email' => 'google@example.com',
            'email_verified' => true,
            'name' => 'Google User',
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProvider('google', 'google-client', $jwk);

        $this->postJson('/api/auth/login', [
            'provider' => 'google',
            'identityToken' => $token,
            'deviceName' => 'Test phone',
        ])
            ->assertOk()
            ->assertJsonPath('user.provider', 'google')
            ->assertJsonPath('user.emailVerified', true)
            ->assertJsonPath('user.email', 'google@example.com');

        $this->assertDatabaseHas('users', [
            'provider' => 'google',
            'provider_id' => 'google-user-1',
            'email' => 'google@example.com',
        ]);
    }

    public function test_provider_login_fails_closed_for_wrong_audience(): void
    {
        [$token, $jwk] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'other-client',
            'sub' => 'google-user-2',
            'email' => 'wrong@example.com',
            'email_verified' => true,
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProvider('google', 'google-client', $jwk);

        $this->postJson('/api/auth/login', [
            'provider' => 'google',
            'identityToken' => $token,
        ])->assertUnauthorized();

        $this->assertDatabaseMissing('users', ['email' => 'wrong@example.com']);
    }

    public function test_apple_login_requires_matching_nonce_and_verified_claims(): void
    {
        [$token, $jwk] = $this->signedToken([
            'iss' => 'https://appleid.apple.com',
            'aud' => 'app.vibyra.mobile',
            'sub' => 'apple-user-1',
            'email' => 'apple@privaterelay.appleid.com',
            'email_verified' => 'true',
            'nonce' => 'expected-nonce',
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProvider('apple', 'app.vibyra.mobile', $jwk);
        $wrongChallenge = $this->postJson('/api/auth/provider/challenge', ['provider' => 'apple'])
            ->assertOk()
            ->json();

        $this->postJson('/api/auth/login', [
            'provider' => 'apple',
            'identityToken' => $token,
            'challengeId' => $wrongChallenge['challengeId'],
        ])->assertUnauthorized();

        Cache::put(
            'auth-provider-challenge:'.hash('sha256', 'matching-challenge'),
            ['provider' => 'apple', 'nonce' => 'expected-nonce'],
            now()->addMinutes(10)
        );
        $this->postJson('/api/auth/login', [
            'provider' => 'apple',
            'identityToken' => $token,
            'challengeId' => 'matching-challenge',
        ])->assertOk()
            ->assertJsonPath('user.provider', 'apple')
            ->assertJsonPath('user.emailVerified', true);

        $this->postJson('/api/auth/login', [
            'provider' => 'apple',
            'identityToken' => $token,
            'challengeId' => 'matching-challenge',
        ])->assertUnauthorized();
    }

    public function test_social_account_deletion_requires_matching_provider_reauthentication(): void
    {
        [$loginToken, $jwk, $privateKey] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-client',
            'sub' => 'delete-social-1',
            'email' => 'delete-social@example.com',
            'email_verified' => true,
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProvider('google', 'google-client', $jwk);
        $sessionToken = $this->postJson('/api/auth/login', [
            'provider' => 'google',
            'identityToken' => $loginToken,
        ])->assertOk()->json('token');
        $headers = ['Authorization' => "Bearer {$sessionToken}"];

        $this->deleteJson('/api/account', [], $headers)->assertUnauthorized();

        $wrongToken = $this->signClaims([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-client',
            'sub' => 'different-google-user',
            'email' => 'other@example.com',
            'email_verified' => true,
            'iat' => time(),
            'exp' => time() + 300,
        ], $privateKey);
        $this->deleteJson('/api/account', ['identityToken' => $wrongToken], $headers)->assertForbidden();

        $this->deleteJson('/api/account', ['identityToken' => $loginToken], $headers)->assertOk();
        $this->assertDatabaseMissing('users', ['email' => 'delete-social@example.com']);
    }

    private function fakeProvider(string $provider, string $audience, array $jwk): void
    {
        Cache::flush();
        config([
            "services.{$provider}_auth.audiences" => [$audience],
            "services.{$provider}_auth.jwks_url" => "https://{$provider}.test/keys",
        ]);
        Http::fake(["https://{$provider}.test/keys" => Http::response(['keys' => [$jwk]])]);
        $this->app->forgetInstance(ProviderIdentityVerifier::class);
    }

    private function signedToken(array $claims): array
    {
        $privateKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $details = openssl_pkey_get_details($privateKey);
        $jwk = [
            'kty' => 'RSA',
            'kid' => 'test-key',
            'n' => $this->base64Url($details['rsa']['n']),
            'e' => $this->base64Url($details['rsa']['e']),
        ];

        return [$this->signClaims($claims, $privateKey), $jwk, $privateKey];
    }

    private function signClaims(array $claims, $privateKey): string
    {
        $header = $this->base64Url(json_encode(['alg' => 'RS256', 'kid' => 'test-key', 'typ' => 'JWT']));
        $payload = $this->base64Url(json_encode($claims));
        openssl_sign("{$header}.{$payload}", $signature, $privateKey, OPENSSL_ALGO_SHA256);

        return "{$header}.{$payload}.".$this->base64Url($signature);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
