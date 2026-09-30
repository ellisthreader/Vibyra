<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, OAuthHop};
use Tests\TestCase;

/**
 * F-01 (security review 2026-09-30): a connect flow belongs to the browser that opened
 * Vibyra's own link, not to whoever the provider happens to send back to the callback.
 */
class ConnectorOAuthFlowBindingTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.github.oauth.client_id' => 'cid',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'csecret']);
        $this->route('POST', '#github\.com/login/oauth/access_token#', Http::response(['access_token' => 'gho_VICTIM_TOKEN', 'token_type' => 'bearer']));
        $this->route('GET', '#api\.github\.com/user$#', Http::response(['login' => 'victim-octocat', 'id' => 42]));
    }

    private function victimApproves(string $providerUrl): \Illuminate\Testing\TestResponse
    {
        $this->flushHeaders(); // the victim's browser: no Vibyra session, and never opened the hop link
        return $this->get('/api/connectors/callback/github?state='.urlencode($this->queryOf($providerUrl)['state']).'&code=victim-consent-code');
    }

    private function holdsVictimToken(): bool
    {
        return DB::table('agent_connections')->where('user_id', $this->user->id)->where('provider', 'github')->exists()
            || DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->where('integration', 'github')->exists();
    }

    public function test_a_victim_who_approves_the_attackers_link_connects_nothing(): void
    {
        $start = $this->postJson('/api/agents/v2/connections/github/start', [])->assertOk()->json();
        $provider = $this->providerPageWithoutCookie($start['url']);
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $provider);
        $this->victimApproves($provider)->assertOk()->assertSee('GitHub was not connected');
        $this->assertFalse($this->holdsVictimToken(), 'The victim\'s token must not land on the attacker\'s account.');
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'access_token'));
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'failed');
    }

    public function test_ordinary_chat_sign_in_is_bound_the_same_way(): void
    {
        $start = $this->postJson('/api/connectors/github/start', [])->assertOk()->json();
        $this->victimApproves($this->providerPageWithoutCookie($start['url']))->assertSee('GitHub was not connected');
        $this->assertFalse($this->holdsVictimToken());
    }

    public function test_a_cookie_from_another_sign_in_does_not_bind_this_one(): void
    {
        $mine = $this->postJson('/api/connectors/github/start', [])->json();
        $this->openSignIn($mine['url']);
        $other = $this->postJson('/api/connectors/github/start', [])->json();
        $provider = $this->providerPageWithoutCookie($other['url']);
        $this->get('/api/connectors/callback/github?state='.urlencode($this->queryOf($provider)['state']).'&code=c')->assertSee('GitHub was not connected');
        $this->assertFalse($this->holdsVictimToken());
    }

    public function test_the_link_sets_a_scoped_http_only_cookie_redirects_once_and_is_not_guessable(): void
    {
        $start = $this->postJson('/api/connectors/github/start', [])->assertOk()->json();
        $this->assertSame('https://vibyra.test/api/connectors/begin/'.$start['flowId'], $start['url']);
        $hop = $this->pressHop($start['url'], $this->visitHop($start['url']))->assertStatus(302); // Continue on the confirmation page
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $hop->headers->get('Location'));
        $this->assertStringContainsString('no-store', (string) $hop->headers->get('Cache-Control'));
        $cookie = collect($hop->headers->getCookies())->first(fn ($c) => str_starts_with($c->getName(), 'vb_oauth_'));
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertTrue($cookie->isSecure());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/api/connectors/callback/github', $cookie->getPath());
        $this->assertGreaterThan(30, strlen((string) $cookie->getValue()));
        $this->assertLessThanOrEqual(time() + 660, $cookie->getExpiresTime());
        $this->assertStringNotContainsString($cookie->getValue(), $hop->headers->get('Location'), 'The nonce never travels through the provider.');
        // A link that was already pressed, and one nobody started, lead nowhere.
        $this->visitHop($start['url'])[0]->assertStatus(404);
        $this->visitHop('https://vibyra.test/api/connectors/begin/'.\Illuminate\Support\Str::uuid())[0]->assertStatus(404);
        $this->get('/api/connectors/begin/not-a-flow')->assertClientError();
    }

    public function test_the_browser_that_opened_the_link_still_connects_through_the_provider(): void
    {
        $start = $this->postJson('/api/agents/v2/connections/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->json();
        $provider = $this->openSignIn($start['url']);
        $this->get('/api/connectors/callback/github?state='.urlencode($this->queryOf($provider)['state']).'&code=mine')
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
        $this->assertTrue($this->holdsVictimToken());
    }

    /** The return link a flow keeps, as the app would get it back after the callback. */
    private function keptReturn(string $returnUrl): ?string
    {
        $flows = app(\App\Services\ChatConnectors\OAuthFlows::class);
        $begun = $flows->begin($this->user->id, $returnUrl, []);
        return $flows->claim($begun['state'], $begun['nonce'])['return'];
    }

    /** F-12: an Expo link can open an attacker-hosted bundle, so it is honoured only for a developer machine, never in production. */
    public function test_an_expo_return_link_is_limited_to_developer_machines_and_never_honoured_in_production(): void
    {
        foreach (['exp://attacker.example:19000', 'exps://evil.com', 'exp://8.8.8.8:19000', 'exp://127.0.0.1.evil.com:8081',
            'exp://user:pw@192.168.1.5:8081', 'exp://evil.local.attacker.com:8081', 'exp://:8081'] as $host)
            $this->assertNull($this->keptReturn($host.'/--/integrations/connected'), $host);
        foreach (['exp://192.168.1.20:8081', 'exp://127.0.0.1:8082', 'exp://10.0.0.7:8081', 'exp://Ellis-Mac.local:8081', 'exp://localhost:8081'] as $host)
            $this->assertSame($host.'/--/integrations/connected', $this->keptReturn($host.'/--/integrations/connected'), $host);
        $this->assertNull($this->keptReturn('exp://192.168.1.20:8081/--/integrations/connected?x=1'));
        $this->assertNull($this->keptReturn('exp://192.168.1.20:8081/--/elsewhere'));
        $this->app['env'] = 'production';
        $this->assertNull($this->keptReturn('exp://192.168.1.20:8081/--/integrations/connected'));
        $this->assertSame('vibyra://integrations/connected', $this->keptReturn('vibyra://integrations/connected'));
    }

    public function test_a_developer_machine_return_link_redirects_the_account_holders_browser_back_to_expo(): void
    {
        $start = $this->postJson('/api/connectors/github/start', ['returnUrl' => 'exp://192.168.1.20:8081/--/integrations/connected'])->json();
        $state = $this->queryOf($this->openSignIn($start['url']))['state'];
        $this->get('/api/connectors/callback/github?code=mine&state='.$state)
            ->assertRedirect('exp://192.168.1.20:8081/--/integrations/connected?flow='.$start['flowId'].'&status=connected');
    }
}
