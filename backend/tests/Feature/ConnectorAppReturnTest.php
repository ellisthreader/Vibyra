<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\ConnectorAppReturn;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class ConnectorAppReturnTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.github.oauth.client_id' => 'cid',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'secret']);
        $this->route('POST', '#github\.com/login/oauth/access_token#', Http::response(['access_token' => 'gho_TEST_PROOF_RETURN']));
        $this->route('GET', '#api\.github\.com/user$#', Http::response(['login' => 'octocat', 'id' => 42]));
    }

    private function start(string $prefix = '/api/agents/v2/connections'): array
    {
        return $this->postJson($prefix.'/github/start', ['appReturn' => 'loopback-v1',
            'returnUrl' => 'http://127.0.0.1:45123/integrations/connected/'.str_repeat('b', 64)])
            ->assertOk()->assertJsonPath('appReturn', true)->json();
    }

    private function finishBrowser(array $start, bool $keepCookie = true, string $suffix = '&code=fixture'): array
    {
        $hop = $this->get($start['url'])->assertRedirect();
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $hop->headers->get('Location'));
        parse_str(parse_url($hop->headers->get('Location'), PHP_URL_QUERY), $query);
        foreach ($hop->headers->getCookies() as $cookie) {
            if ($keepCookie && str_starts_with($cookie->getName(), 'vb_oauth_'))
                $this->withUnencryptedCookie($cookie->getName(), $cookie->getValue());
        }
        $callback = $this->get('/api/connectors/callback/github?state='.$query['state'].$suffix);
        return [$callback, $query];
    }

    public function test_native_sign_in_skips_both_pages_but_saves_nothing_until_the_app_returns_the_browser_proof(): void
    {
        $start = $this->start();
        [$callback, $provider] = $this->finishBrowser($start);
        $callback->assertRedirect();
        $url = $callback->headers->get('Location');
        $this->assertStringStartsWith('http://127.0.0.1:45123/integrations/connected/', $url);
        $this->assertSame('no-referrer', $callback->headers->get('Referrer-Policy'));
        $this->assertStringNotContainsString('gho_', $url);
        parse_str(parse_url($url, PHP_URL_QUERY), $returned);
        $this->assertSame('pending', $returned['status']);
        $this->assertSame($start['flowId'], $returned['flow']);
        $this->assertDatabaseCount('agent_connections', 0);
        $status = $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'pending');
        $this->assertStringNotContainsString($returned['returnCode'], $status->getContent());
        $claim = '/api/agents/v2/connections/flows/'.$start['flowId'].'/claim';
        $this->postJson($claim, ['returnCode' => str_repeat('0', 64)])->assertNotFound();
        $this->assertDatabaseCount('agent_connections', 0);
        $this->postJson($claim, ['returnCode' => $returned['returnCode']])->assertOk()->assertJsonPath('status', 'connected');
        $this->assertDatabaseCount('agent_connections', 1);
        $this->postJson($claim, ['returnCode' => $returned['returnCode']])->assertNotFound();
        $this->get($start['url'])->assertNotFound();
        $this->get('/api/connectors/callback/github?state='.$provider['state'].'&code=fixture')->assertOk()->assertSee('was not connected');
        $this->assertDatabaseCount('agent_connections', 1);
    }

    public function test_a_forwarded_flow_and_even_its_account_bearer_cannot_save_the_provider_without_the_browser_return(): void
    {
        $start = $this->start();
        [$callback] = $this->finishBrowser($start);
        $callback->assertRedirect();
        $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'pending');
        $this->assertDatabaseCount('agent_connections', 0);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'api.github.com/user'));
        $this->travel(11)->minutes();
        $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'expired');
        parse_str(parse_url($callback->headers->get('Location'), PHP_URL_QUERY), $returned);
        $this->postJson('/api/agents/v2/connections/flows/'.$start['flowId'].'/claim', ['returnCode' => $returned['returnCode']])->assertNotFound();
    }

    public function test_the_return_proof_does_not_authorize_another_account(): void
    {
        $start = $this->start();
        [$callback] = $this->finishBrowser($start);
        parse_str(parse_url($callback->headers->get('Location'), PHP_URL_QUERY), $returned);
        $other = \App\Models\User::factory()->create();
        try {
            app(ConnectorAppReturn::class)->claim($start['flowId'], $other->id, $returned['returnCode']);
            $this->fail('Another account claimed this flow.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
        $this->assertDatabaseCount('agent_connections', 0);
        $this->postJson('/api/agents/v2/connections/flows/'.$start['flowId'].'/claim', ['returnCode' => $returned['returnCode']])->assertOk();
    }

    public function test_browser_binding_is_still_required_and_cancellation_returns_to_the_app(): void
    {
        [$unbound] = $this->finishBrowser($this->start(), false);
        $unbound->assertOk()->assertSee('was not connected');
        $this->assertDatabaseCount('agent_connections', 0);
        [$cancelled] = $this->finishBrowser($this->start(), true, '&error=access_denied');
        $cancelled->assertRedirect();
        $this->assertStringContainsString('status=failed', $cancelled->headers->get('Location'));
        $this->assertDatabaseCount('agent_connections', 0);
    }

    public function test_regular_chat_connectors_use_the_same_proof_and_preserve_install_storage(): void
    {
        $start = $this->start('/api/connectors');
        [$callback] = $this->finishBrowser($start);
        parse_str(parse_url($callback->headers->get('Location'), PHP_URL_QUERY), $returned);
        $this->assertDatabaseCount('vibes_integration_installs', 0);
        $this->postJson('/api/connectors/flows/'.$start['flowId'].'/claim', ['returnCode' => $returned['returnCode']])
            ->assertOk()->assertJsonPath('status', 'connected');
        $this->assertDatabaseCount('vibes_integration_installs', 1);
        $this->assertDatabaseCount('agent_connections', 0);
    }

    public function test_only_strict_loopback_returns_enable_automatic_handoff(): void
    {
        foreach (['https://evil.test', 'http://localhost:45123/integrations/connected/'.str_repeat('b', 64),
            'http://127.0.0.1:80/integrations/connected/'.str_repeat('b', 64),
            'http://127.0.0.1:45123/integrations/connected/'.str_repeat('b', 64).'?next=x'] as $url) {
            $this->postJson('/api/agents/v2/connections/github/start', ['appReturn' => 'loopback-v1', 'returnUrl' => $url])->assertStatus(422);
        }
        $ordinary = $this->postJson('/api/agents/v2/connections/github/start', [])->assertOk()->json();
        $this->get($ordinary['url'])->assertOk()->assertSee('Continue');
    }
}
