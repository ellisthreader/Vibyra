<?php

namespace Tests\Feature;

use App\Http\Controllers\VibyraAppController;
use App\Http\Middleware\VerifyHuman;
use App\Models\User;
use App\Models\VibyraSession;
use App\Notifications\AccountEmailChanged;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Billing\IapReceiptVerifier;
use App\Services\ChatConnectors\ConnectorOAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use ReflectionMethod;
use RuntimeException;
use Tests\TestCase;

/** One test per fix from the 2026-09-28 website security audit. */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'services.google_desktop_oauth.client_id' => 'client',
            'services.google_desktop_oauth.client_secret' => 'secret',
            'services.google_desktop_oauth.redirect_uri' => 'https://vibyra.test/api/auth/desktop/google/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://google.test/authorize',
            'services.google_desktop_oauth.token_url' => 'https://google.test/token',
        ]);
    }

    // 1. A finished provider sign-in only goes to whoever started it.
    public function test_provider_result_is_only_released_to_the_starting_session(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $flow = $flows->start('google', ['deviceName' => 'Vibyra Website'], 'website:victim-browser', '1.1.1.1');
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => 't']);

        $this->assertSame('forbidden', $flows->status('google', $flow['flowId'], 'website:attacker-browser')['status']);
        $this->assertSame('forbidden', $flows->status('google', $flow['flowId'])['status']);
        $this->assertSame('complete', $flows->status('google', $flow['flowId'], 'website:victim-browser')['status']);
    }

    public function test_app_flow_secret_is_required_when_given(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $secret = str_repeat('s', 40);
        $flow = $flows->start('google', ['flowSecret' => $secret], null, '1.1.1.1');
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => 't']);

        $this->getJson("/api/auth/desktop/google/status/{$flow['flowId']}")->assertForbidden();
        $this->getJson("/api/auth/desktop/google/status/{$flow['flowId']}", ['X-Vibyra-Flow-Secret' => $secret])
            ->assertOk()->assertJsonPath('status', 'complete');
    }

    public function test_sign_in_link_opened_on_another_network_asks_first(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $flow = $flows->start('google', ['deviceName' => 'Office PC'], null, '9.9.9.9');
        parse_str((string) parse_url($flow['authUrl'], PHP_URL_QUERY), $query);

        $this->get('/api/auth/desktop/google/callback?code=abc&state='.$query['state'])
            ->assertOk()
            ->assertSee('Did you start this sign-in?')
            ->assertSee('Office PC');
        // The state was not consumed by the question.
        $this->assertNotNull($flows->peekState('google', $query['state']));
        $this->assertFalse($flows->needsConfirmation($flows->peekState('google', $query['state']), '9.9.9.9'));
    }

    // 2. Community demo files are sandboxed and unknown types download.
    public function test_hosted_demo_files_are_sandboxed(): void
    {
        $headers = new ReflectionMethod(VibyraAppController::class, 'hostedDemoHeaders');
        $controller = app(VibyraAppController::class);

        $svg = $headers->invoke($controller, 'image/svg+xml');
        $this->assertStringStartsWith('sandbox;', $svg['Content-Security-Policy']);
        $xhtml = $headers->invoke($controller, 'application/xhtml+xml');
        $this->assertSame('application/octet-stream', $xhtml['Content-Type']);
        $this->assertSame('attachment', $xhtml['Content-Disposition']);
        $html = $headers->invoke($controller, 'text/html');
        $this->assertStringStartsWith('sandbox allow-scripts', $html['Content-Security-Policy']);
        $this->assertStringNotContainsString('allow-same-origin', $html['Content-Security-Policy']);
    }

    // 3. Apple test purchases and other apps' receipts are refused.
    public function test_apple_sandbox_receipts_are_refused_in_production(): void
    {
        config(['services.apple_iap.allow_sandbox' => false, 'services.apple_iap.verify_url' => 'https://apple.test/verify']);
        Http::fake(['https://apple.test/verify' => Http::response(['status' => 21007])]);

        $this->expectExceptionMessage('Test purchases are not accepted.');
        app(IapReceiptVerifier::class)->verify('apple', 'app.vibyra.topup.4000', 'receipt');
    }

    public function test_apple_receipts_from_another_app_are_refused(): void
    {
        config(['services.apple_iap.verify_url' => 'https://apple.test/verify']);
        Http::fake(['https://apple.test/verify' => Http::response([
            'status' => 0,
            'receipt' => ['bundle_id' => 'com.someone.else', 'in_app' => [[
                'product_id' => 'app.vibyra.topup.4000', 'transaction_id' => 'x', 'original_transaction_id' => 'x',
            ]]],
        ])]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('different app');
        app(IapReceiptVerifier::class)->verify('apple', 'app.vibyra.topup.4000', 'receipt');
    }

    // 4. Every response carries the baseline browser protections.
    public function test_pages_send_security_headers(): void
    {
        $this->get('/legal/privacy')
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeaderMissing('X-Powered-By');
        $this->assertStringContainsString("frame-ancestors 'self'",
            (string) $this->get('/legal/privacy')->headers->get('Content-Security-Policy'));
        $this->get('https://vibyra.test/legal/privacy')->assertHeader('Strict-Transport-Security');
    }

    // 5. A password reset also ends website sessions.
    public function test_password_reset_ends_website_sessions(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create(['email' => 'reset@example.com', 'provider' => 'email']);
        DB::table('sessions')->insert([
            'id' => 'web-session', 'user_id' => $user->id, 'ip_address' => '1.1.1.1',
            'user_agent' => 'x', 'payload' => '', 'last_activity' => time(),
        ]);

        $this->postJson('/api/auth/password/reset', [
            'email' => 'reset@example.com',
            'token' => Password::broker()->createToken($user),
            'password' => 'new-secret-123',
            'passwordConfirmation' => 'new-secret-123',
        ])->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'web-session']);
    }

    // 6. Changing the account email needs the current password and warns the old address.
    public function test_email_change_needs_the_password(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'old@example.com', 'provider' => 'email', 'password' => 'secret-123']);
        $token = 'security-token';
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'last_used_at' => now()]);
        $auth = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/account/profile', ['name' => 'Me', 'email' => 'attacker@example.com'], $auth)
            ->assertStatus(401)->assertJsonPath('code', 'password_required');
        $this->assertSame('old@example.com', $user->fresh()->email);

        $this->postJson('/api/account/profile', ['name' => 'Me', 'email' => 'new@example.com', 'currentPassword' => 'secret-123'], $auth)
            ->assertOk();
        $this->assertSame('new@example.com', $user->fresh()->email);
        Notification::assertSentOnDemand(AccountEmailChanged::class);
    }

    // 7. A connector link opened on another network asks before attaching the account.
    public function test_connector_link_from_another_network_needs_confirmation(): void
    {
        $oauth = app(ConnectorOAuth::class);
        $method = new ReflectionMethod(ConnectorOAuth::class, 'stateKey');
        Cache::put($method->invoke($oauth, 'probe-state'), ['slug' => 'github', 'startIp' => '9.9.9.9'], 60);

        $this->assertTrue($oauth->needsConfirmation('github', 'probe-state', '1.2.3.4'));
        $this->assertFalse($oauth->needsConfirmation('github', 'probe-state', '9.9.9.9'));
    }

    // 8. Form endpoints need a passed human check, and crawler names alone don't skip it.
    public function test_forms_need_the_human_check_and_fake_crawlers_are_gated(): void
    {
        config([
            'services.turnstile.enabled' => true,
            'services.turnstile.site_key' => 'site',
            'services.turnstile.secret_key' => 'secret',
        ]);

        $this->postJson('/web-api/faq/ask', ['question' => 'hi'])
            ->assertForbidden()->assertJsonPath('code', 'human_check_required');
        $this->withHeader('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1)')
            ->get('/downloads')->assertForbidden();
        $this->withHeader('User-Agent', 'Slackbot-LinkExpanding 1.0')->get('/downloads')->assertOk();
    }

    // 9. An unverified Microsoft email does not keep the address from its owner.
    public function test_unverified_microsoft_email_is_released_on_signup(): void
    {
        $squatter = User::factory()->create([
            'email' => 'owner@example.com', 'provider' => 'microsoft', 'email_verified_at' => null,
        ]);

        $this->postJson('/api/auth/signup', ['name' => 'Owner', 'email' => 'owner@example.com', 'password' => 'secret-123'])
            ->assertCreated();
        $this->assertStringEndsWith('@users.invalid', $squatter->fresh()->email);
    }

    // 10. Checking many addresses from one network is capped.
    public function test_signup_address_checks_are_capped(): void
    {
        foreach (range(1, 5) as $i) {
            User::factory()->create(['email' => "taken{$i}@example.com"]);
            $this->postJson('/api/auth/signup', ['email' => "taken{$i}@example.com", 'password' => 'secret-123'])
                ->assertStatus(409);
        }
        User::factory()->create(['email' => 'taken6@example.com']);
        $this->postJson('/api/auth/signup', ['email' => 'taken6@example.com', 'password' => 'secret-123'])
            ->assertStatus(429);
    }
}
