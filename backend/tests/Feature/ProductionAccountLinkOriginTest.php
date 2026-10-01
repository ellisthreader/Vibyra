<?php
namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VibyraVerifyEmail;
use App\Providers\AppServiceProvider;
use App\Services\Auth\DesktopProviderOAuthFlow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ProductionAccountLinkOriginTest extends TestCase
{
    use RefreshDatabase;

    public function test_forwarded_host_cannot_poison_verification_links_or_registered_oauth_redirect(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['app.url' => 'https://vibyra.net', 'services.turnstile.enabled' => false,
            'services.google_desktop_oauth.client_id' => 'fixture',
            'services.google_desktop_oauth.client_secret' => 'fixture',
            'services.google_desktop_oauth.redirect_uri' => 'https://vibyra-production.up.railway.app/api/auth/desktop/google/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth']);
        (new AppServiceProvider($this->app))->boot();
        Notification::fake();
        $user = User::factory()->create(['provider' => 'email', 'email_verified_at' => null]);
        $this->withHeaders(['Host' => 'attacker.example', 'X-Forwarded-Host' => 'attacker.example', 'X-Forwarded-Proto' => 'http'])
            ->postJson('/api/auth/email/resend', ['email' => $user->email])->assertOk();
        Notification::assertSentTo($user, VibyraVerifyEmail::class, function ($notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;
            $this->assertSame('vibyra.net', parse_url($url, PHP_URL_HOST));
            $this->assertSame('https', parse_url($url, PHP_URL_SCHEME));
            $this->assertStringContainsString('/api/auth/email/verify/', $url);
            return true;
        });
        $flow = app(DesktopProviderOAuthFlow::class)->start('google', ['flowSecret' => str_repeat('s', 64)]);
        parse_str(parse_url($flow['authUrl'], PHP_URL_QUERY), $query);
        $this->assertSame(config('services.google_desktop_oauth.redirect_uri'), $query['redirect_uri']);
    }
}
