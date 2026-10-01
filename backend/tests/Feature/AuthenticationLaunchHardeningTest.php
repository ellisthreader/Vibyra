<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Auth\{DesktopProviderOAuthFlow, Totp};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Hash, Notification, Password};
use Tests\TestCase;

class AuthenticationLaunchHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
            'services.turnstile.enabled' => false,
            'services.google_desktop_oauth.client_id' => 'fixture',
            'services.google_desktop_oauth.client_secret' => 'fixture',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth']);
        Notification::fake();
    }

    public function test_native_flow_requires_secret_and_wrong_owner_cannot_consume_result(): void
    {
        $this->postJson('/api/auth/desktop/google/start')->assertUnprocessable()->assertSee('Update Vibyra');
        $flows = app(DesktopProviderOAuthFlow::class);
        $secret = str_repeat('s', 64);
        $flow = $flows->start('google', ['flowSecret' => $secret], null, '8.8.8.8');
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => 'fixture-token']);
        $this->assertSame('forbidden', $flows->status('google', $flow['flowId'], null, str_repeat('x', 64))['status']);
        $this->assertSame('complete', $flows->status('google', $flow['flowId'], null, $secret)['status']);
        $this->assertSame('expired', $flows->status('google', $flow['flowId'], null, $secret)['status']);
    }

    public function test_native_result_does_not_accept_a_query_string_secret(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $flow = $flows->start('google', ['flowSecret' => str_repeat('s', 64)]);
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => 'fixture']);
        $path = '/api/auth/desktop/google/status/'.$flow['flowId'];
        $this->getJson($path.'?flowSecret='.str_repeat('s', 64))->assertForbidden();
        $this->withHeader('X-Vibyra-Flow-Secret', str_repeat('s', 64))->getJson($path)
            ->assertOk()->assertJsonPath('status', 'complete');
    }

    public function test_bound_flow_still_requires_confirmation_on_another_or_unknown_network(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $flow = $flows->start('google', [], 'browser-proof', '8.8.8.8');
        parse_str(parse_url($flow['authUrl'], PHP_URL_QUERY), $query);
        $held = $flows->peekState('google', $query['state']);
        $this->assertFalse($flows->needsConfirmation($held, '8.8.8.8'));
        $this->assertTrue($flows->needsConfirmation($held, '1.1.1.1'));
        $this->assertTrue($flows->needsConfirmation($held, null));
        $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])
            ->get('/api/auth/desktop/google/callback?'.http_build_query(['state' => $query['state'], 'code' => 'fixture']))
            ->assertOk()->assertSee('Did you start this sign-in?');
        $this->assertNotNull($flows->peekState('google', $query['state']));
        $flows->finish($flow['flowId'], ['status' => 'complete']);
        $this->assertSame('forbidden', $flows->status('google', $flow['flowId'], 'other-browser')['status']);
        $this->assertSame('complete', $flows->status('google', $flow['flowId'], 'browser-proof')['status']);
    }

    public function test_forwarded_ip_cannot_skip_provider_confirmation(): void
    {
        $flow = app(DesktopProviderOAuthFlow::class)->start('google', ['flowSecret' => str_repeat('s', 64)], null, '8.8.8.8');
        parse_str(parse_url($flow['authUrl'], PHP_URL_QUERY), $query);
        $this->withServerVariables(['REMOTE_ADDR' => '100.64.0.7'])
            ->withHeader('X-Forwarded-For', '8.8.8.8')
            ->get('/api/auth/desktop/google/callback?'.http_build_query(['state' => $query['state'], 'code' => 'fixture']))
            ->assertOk()->assertSee('Did you start this sign-in?');
        $this->assertNotNull(app(DesktopProviderOAuthFlow::class)->peekState('google', $query['state']));
    }

    public function test_email_change_requires_password_and_notifies_previous_address(): void
    {
        $user = User::factory()->create(['provider' => 'email', 'email' => 'before@example.test', 'password' => 'fixture-password']);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'fixture-token'), 'last_used_at' => now()]);
        $this->withToken('fixture-token')->postJson('/api/account/profile', ['email' => 'after@example.test'])->assertUnauthorized();
        $this->assertSame('before@example.test', $user->fresh()->email);
        $this->postJson('/api/account/profile', ['email' => 'after@example.test', 'currentPassword' => 'fixture-password'])->assertOk();
        Notification::assertSentOnDemand(\App\Notifications\AccountEmailChanged::class,
            fn ($notice, $channels, $notifiable) => $notifiable->routes['mail'] === 'before@example.test');
    }

    public function test_reset_revokes_existing_browser_and_app_sessions(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create(['provider' => 'email']);
        DB::table('sessions')->insert(['id' => 'old-browser', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'old-token'), 'last_used_at' => now()]);
        $token = Password::broker()->createToken($user);
        $this->postJson('/api/auth/password/reset', ['email' => $user->email, 'token' => $token,
            'password' => 'replacement-password', 'passwordConfirmation' => 'replacement-password'])->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'old-browser']);
        $this->assertDatabaseMissing('vibyra_sessions', ['user_id' => $user->id]);
        $this->assertTrue(Hash::check('replacement-password', $user->fresh()->password));
    }

    public function test_recovery_mail_uses_configured_origin_not_request_host(): void
    {
        config(['app.url' => 'https://vibyra.net']);
        $user = User::factory()->create(['provider' => 'email']);
        $this->withServerVariables(['HTTP_HOST' => 'attacker.example', 'SERVER_NAME' => 'attacker.example'])
            ->postJson('/web-api/auth/password/forgot', ['email' => $user->email])->assertOk();
        Notification::assertSentTo($user, \App\Notifications\VibyraResetPassword::class,
            fn ($notification) => str_starts_with($notification->toMail($user)->actionUrl, 'https://vibyra.net/reset-password?'));
    }

    public function test_browser_recovery_pages_and_reset_use_website_without_app(): void
    {
        $this->get('/forgot-password')->assertOk()->assertSee('portal-root');
        $this->get('/reset-password?token=private-token&email=private%40example.test')
            ->assertOk()->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertDontSee('private-token')->assertDontSee('private@example.test');
        $user = User::factory()->create(['provider' => 'email']);
        $this->postJson('/web-api/auth/password/forgot', ['email' => $user->email])->assertOk();
        Notification::assertSentTo($user, \App\Notifications\VibyraResetPassword::class);
        $token = Password::broker()->createToken($user);
        $this->postJson('/web-api/auth/password/reset', ['email' => $user->email, 'token' => $token,
            'password' => 'new-password-fixture', 'passwordConfirmation' => 'new-password-fixture'])->assertOk();
        $this->assertTrue(Hash::check('new-password-fixture', $user->fresh()->password));
    }

    public function test_password_owner_can_enroll_only_after_password_and_correct_totp(): void
    {
        $user = User::factory()->create(['provider' => 'email', 'email_verified_at' => now(), 'password' => 'fixture-password']);
        config(['owner_analytics.emails' => [$user->email]]);
        $this->actingAs($user)->postJson('/web-api/owner/2fa/start', ['currentPassword' => 'wrong'])->assertForbidden();
        $setup = $this->postJson('/web-api/owner/2fa/start', ['currentPassword' => 'fixture-password'])->assertOk()->json();
        $totp = app(Totp::class);
        $code = $totp->at($totp->decode($setup['secret']), intdiv(time(), Totp::PERIOD));
        $this->postJson('/web-api/owner/2fa/confirm', ['code' => $code])->assertOk()->assertJsonCount(10, 'recoveryCodes');
        $this->getJson('/web-api/owner/accounts')->assertStatus(428);
        $this->postJson('/web-api/owner/2fa/start', ['currentPassword' => 'fixture-password'])->assertConflict();
    }
}
