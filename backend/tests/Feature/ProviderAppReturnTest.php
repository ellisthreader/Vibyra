<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\{DesktopProviderOAuthFlow, DesktopProviderTokenExchange, ProviderIdentityVerifier, TwoFactor};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProviderAppReturnTest extends TestCase
{
    use RefreshDatabase;
    private const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
            'services.google_desktop_oauth.client_id' => 'fixture',
            'services.google_desktop_oauth.client_secret' => 'fixture',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth']);
    }

    private function start(): array
    {
        $start = $this->withServerVariables(['REMOTE_ADDR' => '8.8.8.8'])
            ->postJson('/api/auth/desktop/google/start', ['deviceName' => 'iPhone', 'flowSecret' => self::SECRET,
                'supportsTwoFactor' => true, 'appReturn' => 'vibyra-app-v1'])->assertOk()->assertJsonPath('appReturn', true)->json();
        parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);
        $this->assertStringNotContainsString(self::SECRET, $start['authUrl']);
        $this->assertArrayNotHasKey('returnCode', $start);
        return [$start, ['state' => $query['state'], 'code' => 'verified-code']];
    }

    private function identity(bool $twoFactor): User
    {
        $user = User::factory()->create(['provider' => $twoFactor ? 'email' : 'google',
            'provider_id' => $twoFactor ? null : 'google-owner', 'email' => 'owner@gmail.com', 'email_verified_at' => now()]);
        if ($twoFactor) {
            app(TwoFactor::class)->start($user);
            $user->forceFill(['two_factor_confirmed_at' => now()])->save();
        }
        $this->mock(DesktopProviderTokenExchange::class)->shouldReceive('exchange')->once()->andReturn(['identityToken' => 'verified-fixture']);
        $this->mock(ProviderIdentityVerifier::class)->shouldReceive('verify')->once()->andReturn([
            'subject' => 'google-owner', 'email' => $user->email, 'name' => 'Owner', 'emailVerified' => true, 'authoritativeEmail' => true]);
        return $user;
    }

    public function test_different_network_returns_to_the_app_and_neither_proof_alone_can_claim_the_code_step(): void
    {
        $this->identity(true); [$start, $callback] = $this->start();
        $page = $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])
            ->get('/api/auth/desktop/google/callback?'.http_build_query($callback))->assertStatus(303)
            ->assertHeader('Cache-Control', 'no-store, private')->assertDontSee('Did you start this sign-in?');
        $location = $page->headers->get('Location');
        $this->assertStringStartsWith('vibyra://auth-complete?', $location);
        parse_str(parse_url($location, PHP_URL_QUERY), $returned);
        $this->assertSame(['flowId', 'returnCode'], array_keys($returned));
        $this->assertSame($start['flowId'], $returned['flowId']);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $returned['returnCode']);
        $status = '/api/auth/desktop/google/status/'.$start['flowId'];
        $this->withHeader('X-Vibyra-Return-Code', $returned['returnCode'])->getJson($status)->assertForbidden();
        $this->withHeaders(['X-Vibyra-Flow-Secret' => self::SECRET, 'X-Vibyra-Return-Code' => ''])
            ->getJson($status)->assertOk()->assertExactJson(['ok' => true, 'status' => 'pending']);
        $this->withHeader('X-Vibyra-Return-Code', str_repeat('b', 64))->getJson($status)
            ->assertOk()->assertExactJson(['ok' => true, 'status' => 'pending']);
        $this->assertDatabaseCount('vibyra_sessions', 0);
        $this->withHeader('X-Vibyra-Return-Code', $returned['returnCode'])->getJson($status)->assertOk()
            ->assertJsonPath('status', 'complete')->assertJsonStructure(['twoFactor' => ['challengeId']])
            ->assertJsonMissingPath('token')->assertJsonMissingPath('user');
        $this->getJson($status)->assertStatus(410);
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_normal_session_is_also_held_until_both_proofs_arrive(): void
    {
        $this->identity(false); [$start, $callback] = $this->start();
        $page = $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])
            ->get('/api/auth/desktop/google/callback?'.http_build_query($callback))->assertStatus(303);
        parse_str(parse_url($page->headers->get('Location'), PHP_URL_QUERY), $returned);
        $path = '/api/auth/desktop/google/status/'.$start['flowId'];
        $this->withHeader('X-Vibyra-Flow-Secret', self::SECRET)->getJson($path)->assertJsonPath('status', 'pending');
        $this->withHeader('X-Vibyra-Return-Code', $returned['returnCode'])->getJson($path)->assertOk()->assertJsonStructure(['token', 'user']);
        $this->getJson($path)->assertStatus(410);
    }

    public function test_provider_cancellation_returns_to_the_same_app_without_a_session(): void
    {
        [$start, $callback] = $this->start();
        $page = $this->get('/api/auth/desktop/google/callback?'.http_build_query([...$callback, 'error' => 'access_denied']))->assertStatus(303);
        parse_str(parse_url($page->headers->get('Location'), PHP_URL_QUERY), $returned);
        $this->withHeaders(['X-Vibyra-Flow-Secret' => self::SECRET, 'X-Vibyra-Return-Code' => $returned['returnCode']])
            ->getJson('/api/auth/desktop/google/status/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'failed');
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_website_and_legacy_flows_keep_their_confirmation_and_cannot_opt_out_with_arbitrary_urls(): void
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        foreach (['https://evil.test', 'vibyra://auth-complete', null] as $requested) {
            $start = $flows->start('google', ['flowSecret' => self::SECRET, 'appReturn' => $requested], null, '8.8.8.8');
            parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);
            $this->assertFalse($start['appReturn']);
            $this->assertTrue($flows->needsConfirmation($flows->peekState('google', $query['state']), '1.1.1.1'));
        }
        $start = $flows->start('google', ['appReturn' => 'vibyra-app-v1'], 'website-binding', '8.8.8.8');
        $this->assertFalse($start['appReturn']);
    }
}
