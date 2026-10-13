<?php

namespace Tests\Feature\Support;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

trait AppleDeletionFixtures
{
    private mixed $appleKey;
    private array $appleJwk;

    private function appleSetup(): void
    {
        Storage::fake('apple-delete');
        config(['vibes.attachments_disk' => 'apple-delete',
            'services.apple_auth.audiences' => ['app.vibyra.mobile', 'vibyra.web'],
            'services.apple_auth.jwks_url' => 'https://apple.test/keys',
            'services.apple_native_oauth.client_id' => 'app.vibyra.mobile',
            'services.apple_native_oauth.client_secret' => 'synthetic-native-secret',
            'services.apple_desktop_oauth.client_id' => 'vibyra.web',
            'services.apple_desktop_oauth.client_secret' => 'synthetic-web-secret',
            'services.apple_desktop_oauth.redirect_uri' => 'https://vibyra.test/api/auth/desktop/apple/callback',
            'services.apple_desktop_oauth.authorize_url' => 'https://appleid.apple.com/auth/authorize',
            'services.apple_desktop_oauth.token_url' => 'https://appleid.apple.com/auth/token']);
        $this->appleKey = openssl_pkey_new(self::openSslOptions(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]));
        $details = openssl_pkey_get_details($this->appleKey);
        $this->appleJwk = ['kty' => 'RSA', 'kid' => 'apple-delete-fixture',
            'n' => $this->appleEncode($details['rsa']['n']), 'e' => $this->appleEncode($details['rsa']['e'])];
        Cache::flush(); Http::preventStrayRequests();
    }

    private function appleUser(): array
    {
        $user = User::factory()->create(['provider' => 'apple', 'provider_id' => 'apple-subject']);
        $token = 'synthetic-apple-deletion-session';
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'device_name' => 'Test iPhone', 'last_used_at' => now()]);
        return [$user, $token];
    }

    private function appleProof(): array
    {
        $challenge = $this->postJson('/api/auth/provider/challenge', ['provider' => 'apple'])->assertOk()->json();
        return ['challengeId' => $challenge['challengeId'], 'identityToken' => $this->appleJwt($challenge['nonce']),
            'authorizationCode' => 'synthetic-one-use-code', 'nonce' => $challenge['nonce']];
    }

    private function appleHttp(string $nonce, int $revokeStatus = 200, array $claims = []): void
    {
        Http::fake(['https://apple.test/keys' => Http::response(['keys' => [$this->appleJwk]]),
            'https://appleid.apple.com/auth/token' => Http::response(['id_token' => $this->appleJwt($nonce, $claims),
                'refresh_token' => 'synthetic-refresh-to-revoke', 'access_token' => 'synthetic-access']),
            'https://appleid.apple.com/auth/revoke' => Http::response([], $revokeStatus)]);
    }

    private function appleJwt(string $nonce, array $claims = []): string
    {
        $header = $this->appleEncode(json_encode(['alg' => 'RS256', 'kid' => 'apple-delete-fixture']));
        $payload = $this->appleEncode(json_encode(array_merge(['iss' => 'https://appleid.apple.com',
            'aud' => 'app.vibyra.mobile', 'sub' => 'apple-subject', 'nonce' => $nonce,
            'iat' => time(), 'exp' => time() + 300], $claims)));
        openssl_sign("{$header}.{$payload}", $signature, $this->appleKey, OPENSSL_ALGO_SHA256);
        return "{$header}.{$payload}.".$this->appleEncode($signature);
    }

    private function appleEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
