<?php

namespace Tests\Feature;

use App\Services\Analytics\CountryResolver;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\DesktopProviderTokenExchange;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ProviderFlowSecurityTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'a95c4ae07f47f5ad7285626b5a4f7901422149976ee35368c79d83fc934bfa2a';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google_desktop_oauth' => [
            'client_id' => 'google-client', 'client_secret' => 'test-secret',
            'redirect_uri' => 'https://example.test/callback',
            'authorize_url' => 'https://accounts.google.test/o/oauth2/auth',
        ]]);
    }

    public function test_unbound_legacy_start_is_blocked_and_only_secret_holder_can_collect_token(): void
    {
        $this->postJson('/api/auth/desktop/google/start')->assertStatus(422)
            ->assertJsonPath('error', 'Update Vibyra and try signing in again.');
        $flow = $this->postJson('/api/auth/desktop/google/start', [
            'flowSecret' => self::SECRET,
        ])->assertOk()->json();
        app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
            'ok' => true, 'status' => 'complete', 'token' => 'private-bearer-token',
        ]);

        $this->getJson('/api/auth/desktop/google/status/'.$flow['flowId'])
            ->assertStatus(403)->assertJsonMissingPath('token');
        $this->withHeader('X-Vibyra-Flow-Secret', str_repeat('b', 64))
            ->getJson('/api/auth/desktop/google/status/'.$flow['flowId'])
            ->assertStatus(403)->assertJsonMissingPath('token');
        $this->withHeader('X-Vibyra-Flow-Secret', self::SECRET)
            ->getJson('/api/auth/desktop/google/status/'.$flow['flowId'])
            ->assertOk()->assertJsonPath('token', 'private-bearer-token');

        $legacyId = str_repeat('L', 64);
        Cache::put('desktop-provider-result:'.hash('sha256', $legacyId), [
            'provider' => 'google', 'result' => ['status' => 'complete', 'token' => 'legacy-bearer-token'],
        ], now()->addMinutes(5));
        $this->withHeader('X-Vibyra-Flow-Secret', self::SECRET)
            ->getJson('/api/auth/desktop/google/status/'.$legacyId)
            ->assertStatus(403)->assertJsonMissingPath('token');
    }

    public function test_website_result_requires_original_browser_binding(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $flow = $flows->start('google', ['deviceName' => 'Vibyra Website'], 'website:original', '81.2.69.160');
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => 'browser-only']);

        $this->assertSame('forbidden', $flows->status('google', $flow['flowId'], 'website:other')['status']);
        $this->assertSame('complete', $flows->status('google', $flow['flowId'], 'website:original')['status']);
    }

    public function test_spoofed_xff_cannot_skip_confirmation_or_create_outside_uk(): void
    {
        config([
            'legal.enforce_market_access' => true,
            'legal.trusted_proxy_cidrs' => ['9.9.9.9/32'],
        ]);
        app()->instance(CountryResolver::class, new class extends CountryResolver {
            public function forIp(?string $ip): ?string
            {
                return match ($ip) {
                    '81.2.69.160' => 'GB', '1.2.3.4' => 'FR', default => null,
                };
            }
        });
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->withHeader('X-Forwarded-For', '1.2.3.4, 81.2.69.160');
        $flow = $this->postJson('/api/auth/desktop/google/start', [
            'flowSecret' => self::SECRET, 'termsVersion' => '2026-09-28',
            'termsAccepted' => true, 'adultConfirmed' => true, 'countryCode' => 'GB',
        ])->assertOk()->json();
        parse_str((string) parse_url($flow['authUrl'], PHP_URL_QUERY), $query);
        $state = $query['state'];

        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->withHeader('X-Forwarded-For', '81.2.69.160, 1.2.3.4')
            ->get('/api/auth/desktop/google/callback?'.http_build_query([
                'state' => $state, 'code' => 'test-code',
            ]))->assertOk()->assertSee('Did you start this sign-in?');
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->withHeader('X-Forwarded-For', '81.2.69.160')
            ->get('/api/auth/desktop/google/callback?'.http_build_query([
                'state' => $state, 'code' => 'test-code',
            ]))->assertOk()->assertSee('Did you start this sign-in?');

        app()->instance(DesktopProviderTokenExchange::class, new class extends DesktopProviderTokenExchange {
            public function exchange(string $provider, string $code, array $flow): array
            {
                return ['identityToken' => 'verified'];
            }
        });
        app()->instance(ProviderIdentityVerifier::class, new class extends ProviderIdentityVerifier {
            public function __construct() {}
            public function verify(string $provider, string $token, ?string $nonce = null): array
            {
                return ['subject' => 'new-person', 'email' => 'outside@example.test', 'name' => 'Outside Person'];
            }
        });
        $confirmation = hash_hmac('sha256', $state.'|test-code', (string) config('app.key'));
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->withHeader('X-Forwarded-For', '81.2.69.160, 1.2.3.4')
            ->post('/api/auth/desktop/google/callback', [
                'state' => $state, 'code' => 'test-code',
                'vibyra_confirm' => 'continue', 'vibyra_confirm_token' => $confirmation,
            ])->assertStatus(400);
        $this->assertDatabaseMissing('users', ['email' => 'outside@example.test']);
        $this->assertSame('failed', app(DesktopProviderOAuthFlow::class)
            ->status('google', $flow['flowId'], null, self::SECRET)['status']);
    }
}
