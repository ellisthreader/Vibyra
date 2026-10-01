<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\DesktopProviderOAuthFlow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Notification;
use App\Notifications\VibyraVerifyEmail;
use Tests\TestCase;

class WebsiteAuthSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_portal_pages_render_and_account_requires_web_session(): void
    {
        $this->get('/login')->assertOk();
        $this->get('/billing')->assertOk();
        $this->get('/account')->assertRedirect('/login');

        $this->actingAs(User::factory()->create())->get('/account')->assertOk();
    }

    public function test_web_billing_requires_session_and_reuses_stripe_configuration(): void
    {
        $this->postJson('/web-api/billing/checkout', [
            'kind' => 'subscription', 'plan' => 'starter', 'cycle' => 'monthly',
        ])->assertUnauthorized();

        config(['services.stripe.secret' => '']);
        $this->actingAs(User::factory()->create())->postJson('/web-api/billing/checkout', [
            'kind' => 'subscription', 'plan' => 'starter', 'cycle' => 'monthly',
        ])->assertStatus(503)->assertJsonPath('ok', false);
    }

    public function test_website_signup_uses_shared_user_without_creating_bearer_session(): void
    {
        $this->postJson('/web-api/auth/signup', [
            'name' => 'Website Member',
            'email' => 'member@example.test',
            'password' => 'secret123',
        ])->assertCreated()
            ->assertJsonPath('user.email', 'member@example.test')
            ->assertJsonPath('user.membershipActive', false);

        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'member@example.test', 'plan' => 'free']);
        $this->assertDatabaseCount('vibyra_sessions', 0);

        $this->getJson('/web-api/session')->assertOk()->assertJsonPath('user.email', 'member@example.test');
        $this->postJson('/api/auth/login', [
            'email' => 'member@example.test',
            'password' => 'secret123',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_web_logout_does_not_revoke_existing_app_bearer_session(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Shared Account',
            'email' => 'shared@example.test',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/web-api/auth/login', [
            'email' => 'shared@example.test',
            'password' => 'secret123',
        ])->assertOk();
        $this->assertAuthenticated();

        $this->deleteJson('/web-api/auth/logout')->assertOk();
        $this->assertGuest();
        $this->getJson('/api/session', ['Authorization' => "Bearer {$token}"])->assertOk();
    }

    public function test_provider_status_exchanges_transient_bearer_for_web_session(): void
    {
        config([
            'services.google_desktop_oauth.client_id' => 'google-client',
            'services.google_desktop_oauth.client_secret' => 'google-secret',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
        ]);
        $user = User::factory()->create([
            'provider' => 'google',
            'provider_id' => 'google-user',
            'plan' => 'free',
        ]);
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'device_name' => 'Vibyra Website',
            'last_used_at' => now(),
            'idle_expires_at' => now()->addHour(),
            'absolute_expires_at' => now()->addDay(),
        ]);
        $flows = app(DesktopProviderOAuthFlow::class);
        $this->withSession(['provider_flow_binding' => str_repeat('b', 48)]);
        $flow = $flows->start('google', ['deviceName' => 'Vibyra Website'], 'website:'.str_repeat('b', 48));
        $flows->finish($flow['flowId'], [
            'ok' => true,
            'status' => 'complete',
            'token' => $token,
            'user' => ['id' => $user->id],
            'isNewUser' => false,
        ]);

        $this->getJson("/web-api/auth/provider/google/status/{$flow['flowId']}")
            ->assertOk()
            ->assertJsonPath('status', 'complete')
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonMissingPath('token');

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_provider_catalogue_only_marks_complete_oauth_configurations_available(): void
    {
        config([
            'services.google_desktop_oauth.client_id' => 'google-client',
            'services.google_desktop_oauth.client_secret' => '',
            'services.google_desktop_oauth.redirect_uri' => 'https://vibyra.test/google',
            'services.apple_desktop_oauth.client_id' => 'apple-service',
            'services.apple_desktop_oauth.client_secret' => '',
            'services.apple_desktop_oauth.team_id' => 'TEAM123',
            'services.apple_desktop_oauth.key_id' => 'KEY123',
            'services.apple_desktop_oauth.private_key' => 'key',
            'services.apple_desktop_oauth.redirect_uri' => 'https://vibyra.test/apple',
            'services.microsoft_desktop_oauth.client_id' => '',
        ]);

        $this->getJson('/web-api/auth/providers')->assertOk()
            ->assertJsonPath('providers.google', false)
            ->assertJsonPath('providers.apple', true)
            ->assertJsonPath('providers.microsoft', false);
    }

    public function test_microsoft_email_verification_returns_to_web_account(): void
    {
        $user = User::factory()->create([
            'provider' => 'microsoft',
            'provider_id' => 'microsoft-user',
            'email_verified_at' => null,
        ]);
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1($user->getEmailForVerification()),
        ]);

        $this->get($url)->assertOk()->assertSee('Your email is verified');
        $this->assertTrue($user->fresh()->hasVerifiedEmail());
    }

    public function test_microsoft_member_can_resend_email_verification(): void
    {
        Notification::fake();
        $user = User::factory()->create([
            'provider' => 'microsoft', 'provider_id' => 'microsoft-user', 'email_verified_at' => null,
        ]);

        $this->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();
        Notification::assertSentTo($user, VibyraVerifyEmail::class);
    }
}
