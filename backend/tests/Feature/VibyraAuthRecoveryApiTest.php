<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VibyraResetPassword;
use App\Notifications\VibyraVerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class VibyraAuthRecoveryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_sends_verification_and_signed_link_marks_email_verified(): void
    {
        Notification::fake();
        $this->postJson('/api/auth/signup', [
            'name' => 'Verify Me',
            'email' => 'verify@example.com',
            'password' => 'secret123',
        ])->assertCreated()->assertJsonPath('user.emailVerified', false);

        $user = User::where('email', 'verify@example.com')->firstOrFail();
        Notification::assertSentTo($user, VibyraVerifyEmail::class);
        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $user->id, 'hash' => sha1($user->email)]
        );

        $this->get($url)->assertRedirect('vibyra://email-verified?email=verify%40example.com');
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_password_reset_is_generic_changes_password_and_revokes_sessions(): void
    {
        Notification::fake();
        $sessionToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reset Me',
            'email' => 'reset@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $user = User::where('email', 'reset@example.com')->firstOrFail();

        $this->postJson('/api/auth/password/forgot', ['email' => 'reset@example.com'])
            ->assertOk()
            ->assertJsonMissing(['email' => 'reset@example.com']);
        Notification::assertSentTo($user, VibyraResetPassword::class);

        $token = Password::broker()->createToken($user);
        $this->get('/api/auth/password/open?'.http_build_query([
            'email' => $user->email,
            'token' => $token,
        ]))->assertRedirect('vibyra://reset-password?'.http_build_query([
            'token' => $token,
            'email' => $user->email,
        ]));
        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'new-secret-123',
            'passwordConfirmation' => 'new-secret-123',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secret-123', $user->fresh()->password));
        $this->getJson('/api/session', ['Authorization' => "Bearer {$sessionToken}"])->assertUnauthorized();
    }

    public function test_recovery_notification_supports_legacy_dual_and_verified_rollout_modes(): void
    {
        $user = User::factory()->make(['email' => 'reset@example.com']);
        config()->set('auth.recovery_links.verified_url', 'https://links.vibyra.app/reset-password');

        config()->set('auth.recovery_links.mode', 'legacy');
        $legacy = (new VibyraResetPassword('legacy-token'))->toMail($user);
        $this->assertStringStartsWith(
            'http://localhost/api/auth/password/open?',
            $legacy->actionUrl
        );

        config()->set('auth.recovery_links.mode', 'dual');
        $dual = (new VibyraResetPassword('dual-token'))->toMail($user);
        $this->assertSame(
            'https://links.vibyra.app/reset-password?token=dual-token&email=reset%40example.com',
            $dual->actionUrl
        );
        $this->assertTrue(collect($dual->outroLines)->contains(
            fn ($line) => str_contains($line, '/api/auth/password/open?')
        ));

        config()->set('auth.recovery_links.mode', 'verified');
        $verified = (new VibyraResetPassword('verified-token'))->toMail($user);
        $this->assertSame(
            'https://links.vibyra.app/reset-password?token=verified-token&email=reset%40example.com',
            $verified->actionUrl
        );
        $this->assertFalse(collect($verified->outroLines)->contains(
            fn ($line) => str_contains($line, '/api/auth/password/open?')
        ));
    }

    public function test_verified_mode_upgrades_legacy_open_links_and_sets_no_referrer_headers(): void
    {
        config()->set('auth.recovery_links.mode', 'verified');
        config()->set('auth.recovery_links.verified_url', 'https://links.vibyra.app/reset-password');

        $response = $this->get('/api/auth/password/open?email=reset%40example.com&token=abc')
            ->assertRedirect('https://links.vibyra.app/reset-password?token=abc&email=reset%40example.com')
            ->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_verified_recovery_fallback_page_never_reflects_credentials(): void
    {
        $response = $this->get('/reset-password?email=private%40example.com&token=secret-token')
            ->assertOk()
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
            ->assertSee('Open this link on a device with Vibyra installed', false);

        $response->assertDontSee('private@example.com', false);
        $response->assertDontSee('secret-token', false);

        $this->get('/reset-password')->assertBadRequest();
    }

    public function test_association_documents_require_real_credentials_and_are_no_referrer(): void
    {
        config()->set('auth.recovery_links.apple_app_id', 'TEAMID.app.vibyra.mobile');
        config()->set('auth.recovery_links.android_sha256_cert_fingerprints', []);
        $this->get('/.well-known/apple-app-site-association')->assertStatus(503);
        $this->get('/.well-known/assetlinks.json')->assertStatus(503);

        config()->set('auth.recovery_links.apple_app_id', 'ABCDE12345.app.vibyra.mobile');
        config()->set('auth.recovery_links.android_package', 'app.vibyra.mobile');
        config()->set('auth.recovery_links.android_sha256_cert_fingerprints', [
            implode(':', array_fill(0, 32, 'AA')),
        ]);

        $this->get('/.well-known/apple-app-site-association')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/json')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertJsonPath('applinks.details.0.appID', 'ABCDE12345.app.vibyra.mobile')
            ->assertJsonPath('applinks.details.0.components.0./', '/reset-password');

        $this->get('/.well-known/assetlinks.json')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/json')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertJsonPath('0.target.package_name', 'app.vibyra.mobile')
            ->assertJsonPath(
                '0.target.sha256_cert_fingerprints.0',
                implode(':', array_fill(0, 32, 'AA'))
            );
    }

    public function test_login_endpoint_is_rate_limited(): void
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.50'])
                ->postJson('/api/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong'])
                ->assertUnauthorized();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.50'])
            ->postJson('/api/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong'])
            ->assertTooManyRequests();
    }
}
