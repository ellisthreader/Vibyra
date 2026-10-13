<?php

namespace Tests\Feature;

use App\Services\Auth\AppleClientSecret;
use App\Services\Auth\DesktopProviderTokenExchange;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Support\AppleDeletionFixtures;
use Tests\TestCase;

class AppleBrowserDeletionTest extends TestCase
{
    use RefreshDatabase, AppleDeletionFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->appleSetup();
    }

    public static function revokeResults(): array
    {
        return ['revoked' => [200, 'complete'], 'retry' => [503, 'pending'], 'legacy-no-token' => [200, 'manual']];
    }

    #[DataProvider('revokeResults')]
    public function test_browser_deletion_revokes_exact_service_client_and_shows_honest_status(int $httpStatus, string $expected): void
    {
        [$user, $token] = $this->appleUser();
        $start = $this->withToken($token)->postJson('/api/auth/desktop/apple/start', ['purpose' => 'deletion'])->assertOk()->json();
        parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);
        Http::fake(['https://apple.test/keys' => Http::response(['keys' => [$this->appleJwk]]),
            'https://appleid.apple.com/auth/token' => Http::response([
                'id_token' => $this->appleJwt($query['nonce'], ['aud' => 'vibyra.web']),
                ...($expected === 'manual' ? [] : ['access_token' => 'synthetic-browser-access']),
            ]), 'https://appleid.apple.com/auth/revoke' => function ($request) use ($httpStatus) {
                $this->assertSame('vibyra.web', $request['client_id']);
                $this->assertSame('synthetic-web-secret', $request['client_secret']);
                $this->assertSame('synthetic-browser-access', $request['token']);
                $this->assertSame('access_token', $request['token_type_hint']);
                return Http::response([], $httpStatus);
            }]);
        $response = $this->post('/api/auth/desktop/apple/callback', ['state' => $query['state'], 'code' => 'synthetic-browser-code'])
            ->assertOk()->assertSee('Vibyra account deleted');
        if ($expected !== 'complete') $response->assertSee('Sign in with Apple');
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->getJson('/api/auth/desktop/apple/status/'.$start['flowId'])->assertOk()
            ->assertExactJson(['ok' => true, 'status' => 'complete', 'deleted' => true,
                'cleanupPending' => $expected !== 'complete', 'appleRevocation' => $expected]);
        Http::assertSentCount($expected === 'manual' ? 2 : 3);
    }

    public function test_signin_code_exchange_does_not_return_deletion_credentials(): void
    {
        Http::fake(['https://appleid.apple.com/auth/token' => Http::response([
            'id_token' => 'synthetic-identity', 'refresh_token' => 'synthetic-refresh', 'access_token' => 'synthetic-access'])]);
        $this->assertSame(['identityToken' => 'synthetic-identity'],
            app(DesktopProviderTokenExchange::class)->exchange('apple', 'synthetic-code', ['purpose' => 'signin']));
    }

    public function test_native_client_secret_is_signed_for_app_id_not_services_id(): void
    {
        $key = openssl_pkey_new(self::openSslOptions(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']));
        openssl_pkey_export($key, $private);
        $jwt = app(AppleClientSecret::class)->make(['client_id' => 'app.vibyra.mobile',
            'team_id' => 'SYNTHETIC_TEAM', 'key_id' => 'SYNTHETIC_KEY', 'private_key' => $private]);
        [$header, $claims, $signature] = explode('.', $jwt);
        $decode = fn ($value) => json_decode(base64_decode(strtr($value, '-_', '+/')), true);
        $this->assertSame(['alg' => 'ES256', 'kid' => 'SYNTHETIC_KEY'], $decode($header));
        $this->assertSame('app.vibyra.mobile', $decode($claims)['sub']);
        $this->assertSame('https://appleid.apple.com', $decode($claims)['aud']);
        $this->assertSame(300, $decode($claims)['exp'] - $decode($claims)['iat']);
        $raw = base64_decode(strtr($signature, '-_', '+/'));
        $this->assertSame(64, strlen($raw));
        $integer = function ($bytes) {
            $bytes = ltrim($bytes, "\0");
            if (ord($bytes[0]) > 127) $bytes = "\0".$bytes;
            return "\x02".chr(strlen($bytes)).$bytes;
        };
        $der = $integer(substr($raw, 0, 32)).$integer(substr($raw, 32));
        $der = "\x30".chr(strlen($der)).$der;
        $this->assertSame(1, openssl_verify("{$header}.{$claims}", $der,
            openssl_pkey_get_details($key)['key'], OPENSSL_ALGO_SHA256));
    }
}
