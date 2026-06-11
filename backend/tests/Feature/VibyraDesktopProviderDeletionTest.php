<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class VibyraDesktopProviderDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_deletion_start_requires_auth_and_caches_minimum_account_identity(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        [$user, $token] = $this->providerUser('google', 'expected-google-subject');

        $start = $this->withToken($token)->postJson('/api/auth/desktop/google/start', [
            'purpose' => 'deletion',
            'deviceName' => 'Must not be cached',
            'installId' => 'must-not-be-cached',
        ])->assertOk()->json();

        $flow = Cache::get('desktop-provider-flow:'.hash('sha256', $start['flowId']));
        $this->assertSame('deletion', $flow['purpose']);
        $this->assertSame($user->id, $flow['accountId']);
        $this->assertSame('expected-google-subject', $flow['providerSubject']);
        $this->assertArrayNotHasKey('deviceName', $flow);
        $this->assertArrayNotHasKey('installId', $flow);

        $this->withToken('invalid-token')
            ->postJson('/api/auth/desktop/google/start', ['purpose' => 'deletion'])
            ->assertUnauthorized();
    }

    public function test_deletion_start_rejects_a_provider_mismatch(): void
    {
        $this->configureProvider('apple', 'apple-desktop-client');
        [, $token] = $this->providerUser('google', 'google-subject');

        $this->withToken($token)->postJson('/api/auth/desktop/apple/start', [
            'purpose' => 'deletion',
        ])->assertForbidden();
    }

    public function test_deletion_callback_rejects_a_different_provider_subject(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        [$user, $token] = $this->providerUser('google', 'expected-subject');
        $start = $this->startDeletion('google', $token);
        $query = $this->authorizationQuery($start['authUrl']);
        $this->fakeIdentity('google', 'google-desktop-client', 'different-subject', $query['nonce']);

        $this->get('/api/auth/desktop/google/callback?'.http_build_query([
            'state' => $query['state'],
            'code' => 'google-code',
        ]))->assertBadRequest();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
            ->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonPath('status', 'failed');
    }

    public function test_verified_deletion_removes_the_exact_account_and_returns_no_token(): void
    {
        $this->configureProvider('google', 'google-desktop-client');
        [$user, $token] = $this->providerUser('google', 'expected-subject');
        $start = $this->startDeletion('google', $token);
        $query = $this->authorizationQuery($start['authUrl']);
        $this->fakeIdentity('google', 'google-desktop-client', 'expected-subject', $query['nonce']);

        $this->get('/api/auth/desktop/google/callback?'.http_build_query([
            'state' => $query['state'],
            'code' => 'google-code',
        ]))->assertOk()->assertSee('Vibyra account deleted');

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->getJson("/api/auth/desktop/apple/status/{$start['flowId']}")
            ->assertStatus(410)
            ->assertJsonPath('status', 'expired');
        $status = $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
            ->assertOk()
            ->assertExactJson([
                'ok' => true,
                'status' => 'complete',
                'deleted' => true,
            ])->json();
        $this->assertArrayNotHasKey('token', $status);
        $this->assertArrayNotHasKey('identityToken', $status);
        $this->getJson("/api/auth/desktop/google/status/{$start['flowId']}")
            ->assertStatus(410)
            ->assertJsonPath('status', 'expired');
    }

    private function startDeletion(string $provider, string $token): array
    {
        return $this->withToken($token)->postJson("/api/auth/desktop/{$provider}/start", [
            'purpose' => 'deletion',
        ])->assertOk()->json();
    }

    private function providerUser(string $provider, string $subject): array
    {
        $user = User::factory()->create([
            'provider' => $provider,
            'provider_id' => $subject,
        ]);
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'device_name' => 'Desktop',
            'last_used_at' => now(),
        ]);

        return [$user, $token];
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

    private function fakeIdentity(string $provider, string $audience, string $subject, string $nonce): void
    {
        [$identityToken, $jwk] = $this->signedToken([
            'iss' => $provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
            'aud' => $audience,
            'sub' => $subject,
            'email' => "{$subject}@example.test",
            'email_verified' => true,
            'nonce' => $nonce,
            'iat' => time(),
            'exp' => time() + 300,
        ]);
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
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $details = openssl_pkey_get_details($key);
        $jwk = [
            'kty' => 'RSA',
            'kid' => 'deletion-test-key',
            'n' => $this->base64Url($details['rsa']['n']),
            'e' => $this->base64Url($details['rsa']['e']),
        ];
        $header = $this->base64Url(json_encode(['alg' => 'RS256', 'kid' => 'deletion-test-key']));
        $payload = $this->base64Url(json_encode($claims));
        openssl_sign("{$header}.{$payload}", $signature, $key, OPENSSL_ALGO_SHA256);

        return ["{$header}.{$payload}.".$this->base64Url($signature), $jwk];
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
