<?php

namespace Tests\Feature;

use App\Http\Middleware\RequireApprovedMarket;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Analytics\CountryResolver;
use App\Services\Auth\DesktopProviderOAuthFlow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class ApprovedMarketMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'legal.enforce_market_access' => true,
            'legal.account_countries' => ['GB'],
            'legal.trusted_proxy_cidrs' => ['100.64.0.0/10'],
        ]);
        Route::middleware(['web', RequireApprovedMarket::class])
            ->get('/market-test', fn () => response()->json(['ok' => true]));
        Route::middleware(['web', RequireApprovedMarket::class.':signup'])
            ->post('/market-signup-test', fn () => response()->json(['ok' => true]));
        app()->instance(CountryResolver::class, new class extends CountryResolver {
            public function forIp(?string $ip): ?string
            {
                return match ($ip) {
                    '81.2.69.160' => 'GB',
                    '1.2.3.4' => 'FR',
                    default => null,
                };
            }
        });
    }

    public function test_direct_public_peer_cannot_be_overridden_by_forwarded_header(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->getJson('/market-test', ['X-Forwarded-For' => '1.2.3.4'])
            ->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160'])
            ->assertStatus(451)->assertJsonPath('code', 'market_unavailable');
    }

    public function test_trusted_proxy_uses_only_its_last_public_forwarded_hop(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '100.64.0.7'])
            ->getJson('/market-test', ['X-Forwarded-For' => '1.2.3.4, 81.2.69.160'])
            ->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '100.64.0.7'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160, 1.2.3.4'])
            ->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '100.64.0.7'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160, 127.0.0.1'])
            ->assertStatus(451);
    }

    public function test_public_trusted_edge_and_spoofed_left_entries_do_not_override_client(): void
    {
        config(['legal.trusted_proxy_cidrs' => ['100.64.0.0/10', '9.9.9.9/32']]);
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->getJson('/market-test', ['X-Forwarded-For' => '1.2.3.4, 81.2.69.160'])
            ->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '100.64.0.7'])
            ->getJson('/market-test', ['X-Forwarded-For' => '1.2.3.4, 81.2.69.160, 9.9.9.9'])
            ->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160, 1.2.3.4'])
            ->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160, malformed'])
            ->assertStatus(451);
    }

    public function test_unknown_or_untrusted_proxy_location_fails_closed(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->getJson('/market-test', ['X-Forwarded-For' => '81.2.69.160'])
            ->assertStatus(451);
        $this->assertNotContains(RequireApprovedMarket::class,
            Route::getRoutes()->getByName('legal.privacy')->gatherMiddleware());
        // A missing GeoIP database is not an implicit UK location.
        app()->forgetInstance(CountryResolver::class);
        config(['services.maxmind.database_path' => '/nonexistent/GeoLite2-City.mmdb']);
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->getJson('/market-test')->assertStatus(451);
    }

    public function test_signup_declaration_and_existing_account_country_must_match_location(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->postJson('/market-signup-test', ['countryCode' => 'FR'])->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->postJson('/market-signup-test', ['countryCode' => 'GB'])->assertOk();

        $user = User::factory()->create(['country_code' => 'FR']);
        $this->actingAs($user)->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->getJson('/market-test')->assertStatus(451);
        $user->forceFill(['country_code' => 'GB'])->save();
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->getJson('/market-test')->assertOk();
    }

    public function test_bearer_account_country_is_checked_without_trusting_request_body(): void
    {
        $user = User::factory()->create(['country_code' => 'FR']);
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'device_name' => 'Test phone', 'last_used_at' => now(),
        ]);
        $this->withServerVariables(['REMOTE_ADDR' => '81.2.69.160'])
            ->getJson('/market-test', ['Authorization' => 'Bearer '.$token])
            ->assertStatus(451);
    }

    public function test_real_product_routes_close_while_rights_and_static_pages_remain_available(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/community/projects')->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/api/auth/signup', ['countryCode' => 'GB'])->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->getJson('/api/community/projects')->assertStatus(451);

        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/legal/privacy')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/privacy/requests')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/downloads')->assertOk();

        $user = User::factory()->create(['country_code' => 'GB']);
        $this->actingAs($user)->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/account/delete')->assertOk();
        $response = $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->deleteJson('/web-api/account', ['password' => 'wrong-password']);
        $this->assertNotEquals(451, $response->status());
    }

    public function test_existing_web_account_can_sign_in_abroad_for_deletion_and_billing(): void
    {
        $user = User::factory()->create(['country_code' => 'GB']);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/auth/login/2fa', ['challengeId' => 'invalid', 'code' => '000000'])
            ->assertStatus(401);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk();
        $this->assertAuthenticatedAs($user);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/account')->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/community/projects')->assertStatus(451);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->get('/account/delete')->assertOk();
        config(['services.stripe.secret' => '']);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/billing/portal', [])->assertStatus(503);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->deleteJson('/web-api/account', ['password' => 'password'])->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/auth/signup', ['countryCode' => 'GB'])->assertStatus(451);
    }

    public function test_web_provider_login_can_start_abroad_but_signup_remains_gated(): void
    {
        config(['services.google_desktop_oauth' => [
            'client_id' => 'google-test-client',
            'client_secret' => 'google-test-secret',
            'redirect_uri' => 'https://example.test/callback',
            'authorize_url' => 'https://accounts.google.test/o/oauth2/auth',
        ]]);
        $flow = $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/auth/provider/google/start', [])->assertOk()->json();
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/web-api/auth/provider/google/status/'.$flow['flowId'])
            ->assertOk()->assertJsonPath('status', 'pending');
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->postJson('/web-api/auth/signup', ['countryCode' => 'GB'])->assertStatus(451);
    }

    public function test_provider_deletion_status_remains_available_but_signin_status_is_gated(): void
    {
        config(['services.google_desktop_oauth' => [
            'client_id' => 'google-test-client',
            'redirect_uri' => 'https://example.test/callback',
            'authorize_url' => 'https://accounts.google.test/o/oauth2/auth',
        ]]);
        $flows = app(DesktopProviderOAuthFlow::class);
        $deletion = $flows->startDeletion('google', 42, 'subject-42');
        $signin = $flows->start('google', [
            'deviceName' => 'Test device', 'flowSecret' => str_repeat('a', 64),
        ]);

        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/auth/desktop/google/status/'.$deletion['flowId'])
            ->assertOk()->assertJsonPath('status', 'pending');
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/auth/desktop/google/status/'.$signin['flowId'])
            ->assertStatus(451);

        $flows->finish($deletion['flowId'], ['ok' => true, 'status' => 'complete', 'deleted' => true]);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/auth/desktop/google/status/'.$deletion['flowId'])
            ->assertOk()->assertJsonPath('deleted', true);
    }
}
