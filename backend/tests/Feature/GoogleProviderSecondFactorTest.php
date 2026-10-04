<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\{DesktopProviderTokenExchange, ProviderIdentityVerifier, TwoFactor, Totp};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GoogleProviderSecondFactorTest extends TestCase
{
    use RefreshDatabase;
    private const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private function prepare(bool $authoritative = true, bool $verified = true): User
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
            'services.google_desktop_oauth.client_id' => 'fixture',
            'services.google_desktop_oauth.client_secret' => 'fixture',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth']);
        $user = User::factory()->create(['provider' => 'email', 'provider_id' => null,
            'email' => 'owner@gmail.com', 'email_verified_at' => $verified ? now() : null]);
        app(TwoFactor::class)->start($user);
        $user->forceFill(['two_factor_confirmed_at' => now()])->save();
        $this->mock(DesktopProviderTokenExchange::class)->shouldReceive('exchange')
            ->andReturn(['identityToken' => 'verified-fixture']);
        $this->mock(ProviderIdentityVerifier::class)->shouldReceive('verify')->andReturn([
            'subject' => 'google-owner', 'email' => $user->email, 'name' => 'Owner',
            'emailVerified' => true, 'authoritativeEmail' => $authoritative]);
        return $user->fresh();
    }

    private function flow(bool $supports = true): array
    {
        $start = $this->withServerVariables(['REMOTE_ADDR' => '8.8.8.8'])
            ->postJson('/api/auth/desktop/google/start', ['deviceName' => 'iPhone',
                'flowSecret' => self::SECRET, 'supportsTwoFactor' => $supports])->assertOk()->json();
        parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);
        return [$start, ['state' => $query['state'], 'code' => 'verified-code']];
    }

    public function test_cross_network_confirmation_then_code_opens_the_existing_account_once(): void
    {
        $user = $this->prepare(); $password = $user->password;
        [$start, $callback] = $this->flow();
        $path = '/api/auth/desktop/google/callback';
        $page = $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])->get($path.'?'.http_build_query($callback))
            ->assertOk()->assertSee('Did you start this sign-in?');
        preg_match('/name="vibyra_confirm_token" value="([a-f0-9]{64})"/', $page->getContent(), $match);
        $this->post($path, [...$callback, 'vibyra_confirm' => 'continue', 'vibyra_confirm_token' => $match[1]])
            ->assertOk()->assertSee('Enter your authenticator code');
        $status = '/api/auth/desktop/google/status/'.$start['flowId'];
        $this->withHeader('X-Vibyra-Flow-Secret', str_repeat('x', 64))->getJson($status)->assertForbidden();
        $result = $this->withHeader('X-Vibyra-Flow-Secret', self::SECRET)->getJson($status)->assertOk()
            ->assertJsonPath('status', 'complete')->assertJsonMissingPath('token')->assertJsonMissingPath('user')->json();
        $this->assertDatabaseCount('users', 1); $this->assertDatabaseCount('vibyra_sessions', 0);
        $this->assertSame('email', $user->fresh()->provider); $this->assertSame($password, $user->fresh()->password);
        $totp = app(Totp::class); $code = $totp->at($totp->decode(\Illuminate\Support\Facades\Crypt::decryptString($user->two_factor_secret)), intdiv(time(), Totp::PERIOD));
        $wrong = (($code[0] + 1) % 10).substr($code, 1);
        $challenge = $result['twoFactor']['challengeId'];
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $wrong])->assertUnauthorized();
        $login = $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $code, 'deviceName' => 'iPhone'])
            ->assertOk()->assertJsonPath('user.email', $user->email)->json();
        $this->withToken($login['token'])->getJson('/api/session')->assertOk()->assertJsonPath('user.email', $user->email);
        $this->postJson('/api/auth/login/2fa', ['challengeId' => $challenge, 'code' => $code])->assertUnauthorized();
        $this->assertDatabaseCount('users', 1); $this->assertDatabaseCount('vibyra_sessions', 1);
    }

    public function test_legacy_clients_do_not_receive_a_session_that_bypasses_the_code(): void
    {
        $this->prepare(); [$start, $callback] = $this->flow(false);
        $this->get('/api/auth/desktop/google/callback?'.http_build_query($callback))->assertStatus(400);
        $this->withHeader('X-Vibyra-Flow-Secret', self::SECRET)
            ->getJson('/api/auth/desktop/google/status/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'failed');
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_untrusted_google_email_still_cannot_select_the_existing_account(): void
    {
        $this->prepare(false); [$start, $callback] = $this->flow();
        $this->get('/api/auth/desktop/google/callback?'.http_build_query($callback))->assertStatus(400);
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_unverified_local_email_still_cannot_select_the_existing_account(): void
    {
        $this->prepare(true, false); [$start, $callback] = $this->flow();
        $this->get('/api/auth/desktop/google/callback?'.http_build_query($callback))->assertStatus(400);
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }
}
