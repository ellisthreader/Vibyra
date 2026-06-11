<?php

namespace Tests\Feature;

use App\Services\Auth\DesktopProviderTokenExchange;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraDesktopProviderAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_google_desktop_oauth_creates_a_real_account_session(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        $start = $this->postJson('/api/auth/desktop/google/start', [
            'deviceName' => 'Office PC',
            'installId' => 'desktop-install',
            'publicIp' => '8.8.8.8',
        ])->assertOk()->json();
        $query = $this->authorizationQuery($start['authUrl']);

        [$identityToken, $jwk] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-desktop-client',
            'sub' => 'desktop-google-user',
            'email' => 'desktop-google@example.com',
            'email_verified' => true,
            'name' => 'Desktop Google',
            'nonce' => $query['nonce'],
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProviderResponses('google', $identityToken, $jwk);

        $this->get('/api/auth/desktop/google/callback?'.http_build_query([
            'state' => $query['state'],
            'code' => 'google-code',
        ]))->assertOk()->assertSee('Signed in to Vibyra');

        $status = $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
            ->assertOk()
            ->assertJsonPath('status', 'complete')
            ->assertJsonPath('isNewUser', true)
            ->assertJsonPath('user.provider', 'google')
            ->json();

        $this->withToken($status['token'])
            ->withHeader('X-Vibyra-Public-IP', '8.8.8.8')
            ->getJson('/api/session')
            ->assertOk()
            ->assertJsonPath('user.email', 'desktop-google@example.com');
        $this->assertDatabaseHas('vibyra_sessions', [
            'device_name' => 'Office PC',
            'device_identifier' => 'desktop-install',
            'ip_address' => '8.8.8.8',
        ]);
    }

    public function test_apple_desktop_oauth_accepts_form_post_and_first_login_name(): void
    {
        $this->configureProvider('apple', 'apple.desktop.service');
        $start = $this->postJson('/api/auth/desktop/apple/start', [
            'deviceName' => 'Studio Mac',
            'installId' => 'studio-mac',
        ])->assertOk()->json();
        $query = $this->authorizationQuery($start['authUrl']);
        $this->assertSame('form_post', $query['response_mode']);

        [$identityToken, $jwk] = $this->signedToken([
            'iss' => 'https://appleid.apple.com',
            'aud' => 'apple.desktop.service',
            'sub' => 'desktop-apple-user',
            'email' => 'desktop-apple@privaterelay.appleid.com',
            'email_verified' => 'true',
            'nonce' => $query['nonce'],
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProviderResponses('apple', $identityToken, $jwk);

        $this->post('/api/auth/desktop/apple/callback', [
            'state' => $query['state'],
            'code' => 'apple-code',
            'user' => json_encode(['name' => ['firstName' => 'Apple', 'lastName' => 'Desktop']]),
        ])->assertOk()->assertSee('Signed in to Vibyra');

        $this->getJson("/api/auth/desktop/apple/status/{$start['flowId']}")
            ->assertOk()
            ->assertJsonPath('status', 'complete')
            ->assertJsonPath('isNewUser', true)
            ->assertJsonPath('user.name', 'Apple Desktop')
            ->assertJsonPath('user.provider', 'apple');
    }

    public function test_desktop_oauth_status_is_one_time_and_expires_after_pickup(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        $start = $this->postJson('/api/auth/desktop/google/start')->assertOk()->json();
        $query = $this->authorizationQuery($start['authUrl']);
        [$identityToken, $jwk] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-desktop-client',
            'sub' => 'one-time-user',
            'email' => 'one-time@example.com',
            'email_verified' => true,
            'nonce' => $query['nonce'],
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        $this->fakeProviderResponses('google', $identityToken, $jwk);
        $this->get('/api/auth/desktop/google/callback?'.http_build_query([
            'state' => $query['state'],
            'code' => 'google-code',
        ]))->assertOk();

        $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")->assertOk();
        $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
            ->assertStatus(410)
            ->assertJsonPath('status', 'expired');
    }

    public function test_existing_google_account_is_not_marked_as_new_on_a_later_login(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        [$identityToken, $jwk] = $this->signedToken([
            'iss' => 'https://accounts.google.com',
            'aud' => 'google-desktop-client',
            'sub' => 'returning-google-user',
            'email' => 'returning@example.com',
            'email_verified' => true,
            'iat' => time(),
            'exp' => time() + 300,
        ]);
        Http::fake(['https://google.test/keys' => Http::response(['keys' => [$jwk]])]);
        $payload = ['provider' => 'google', 'identityToken' => $identityToken];

        $this->postJson('/api/auth/login', $payload)->assertOk()
            ->assertJsonPath('isNewUser', true);
        $this->postJson('/api/auth/login', $payload)->assertOk()
            ->assertJsonPath('isNewUser', false);
    }

    public function test_apple_exchange_generates_an_es256_client_secret_from_key_settings(): void
    {
        $privateKey = openssl_pkey_new([
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ]);
        openssl_pkey_export($privateKey, $privateKeyPem);
        config([
            'services.apple_desktop_oauth.client_id' => 'apple.desktop.service',
            'services.apple_desktop_oauth.client_secret' => '',
            'services.apple_desktop_oauth.team_id' => 'TEAM123',
            'services.apple_desktop_oauth.key_id' => 'KEY123',
            'services.apple_desktop_oauth.private_key' => $privateKeyPem,
            'services.apple_desktop_oauth.redirect_uri' => 'https://vibyra.test/api/auth/desktop/apple/callback',
            'services.apple_desktop_oauth.token_url' => 'https://apple.test/token',
        ]);
        Http::fake(['https://apple.test/token' => Http::response(['id_token' => 'identity-token'])]);

        app(DesktopProviderTokenExchange::class)->exchange('apple', 'apple-code', []);

        Http::assertSent(function ($request) {
            $secret = (string) $request['client_secret'];
            $parts = explode('.', $secret);
            $header = json_decode($this->decodeBase64Url($parts[0] ?? ''), true);
            $signature = $this->decodeBase64Url($parts[2] ?? '');

            return count($parts) === 3
                && ($header['alg'] ?? null) === 'ES256'
                && ($header['kid'] ?? null) === 'KEY123'
                && strlen($signature) === 64;
        });
    }

    private function configureProvider(string $provider, string $clientId): void
    {
        Cache::flush();
        config([
            "services.{$provider}_auth.audiences" => [$clientId],
            "services.{$provider}_auth.jwks_url" => "https://{$provider}.test/keys",
            "services.{$provider}_desktop_oauth.client_id" => $clientId,
            "services.{$provider}_desktop_oauth.client_secret" => 'desktop-secret',
            "services.{$provider}_desktop_oauth.redirect_uri" => "https://vibyra.test/api/auth/desktop/{$provider}/callback",
            "services.{$provider}_desktop_oauth.authorize_url" => "https://{$provider}.test/authorize",
            "services.{$provider}_desktop_oauth.token_url" => "https://{$provider}.test/token",
        ]);
        $this->app->forgetInstance(ProviderIdentityVerifier::class);
    }

    private function fakeProviderResponses(string $provider, string $identityToken, array $jwk): void
    {
        Http::fake([
            "https://{$provider}.test/token" => Http::response(['id_token' => $identityToken]),
            "https://{$provider}.test/keys" => Http::response(['keys' => [$jwk]]),
        ]);
    }

    private function authorizationQuery(string $url): array
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        return $query;
    }

    private function signedToken(array $claims): array
    {
        $privateKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $details = openssl_pkey_get_details($privateKey);
        $jwk = [
            'kty' => 'RSA',
            'kid' => 'desktop-test-key',
            'n' => $this->base64Url($details['rsa']['n']),
            'e' => $this->base64Url($details['rsa']['e']),
        ];
        $header = $this->base64Url(json_encode(['alg' => 'RS256', 'kid' => 'desktop-test-key', 'typ' => 'JWT']));
        $payload = $this->base64Url(json_encode($claims));
        openssl_sign("{$header}.{$payload}", $signature, $privateKey, OPENSSL_ALGO_SHA256);

        return ["{$header}.{$payload}.".$this->base64Url($signature), $jwk];
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function decodeBase64Url(string $value): string
    {
        return (string) base64_decode(strtr($value, '-_', '+/'));
    }
}
