<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\ChatConnectors\{ConnectorOAuth, OAuthFlows};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\OAuthHop;
use Tests\TestCase;

class ConnectorCallbackOriginTest extends TestCase
{
    use RefreshDatabase, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://marketing.test', 'chat_connectors.enabled' => true,
            'chat_connectors.callback_base_url' => 'https://oauth.test/',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'chat_connectors.catalogue.gmail.oauth.client_id' => 'google-client',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'google-secret']);
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'signed-in'), 'device_name' => 'iPhone']);
        $this->withToken('signed-in');
    }

    public function test_google_round_trip_keeps_browser_binding_and_exchange_on_the_registered_origin(): void
    {
        $start = $this->postJson('/api/connectors/gmail/start', [
            'returnUrl' => 'vibyra://integrations/connected', 'callbackBaseUrl' => 'https://attacker.test',
        ])->assertOk()->json();
        $this->assertStringStartsWith('https://oauth.test/api/connectors/begin/', $start['url']);
        $visit = $this->visitHop($start['url']);
        $visit[0]->assertOk();
        $hop = $this->pressHop($start['url'], $visit)->assertRedirect();
        $query = $this->queryOf($hop->headers->get('Location'));
        $callback = 'https://oauth.test/api/connectors/callback/gmail';
        $this->assertSame($callback, $query['redirect_uri']);
        $cookie = collect($hop->headers->getCookies())->first(fn ($c) => str_starts_with($c->getName(), 'vb_oauth_'));
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertTrue($cookie->isSecure());
        $this->assertNull($cookie->getDomain());
        $this->assertSame('/api/connectors/callback/gmail', $cookie->getPath());
        $this->withUnencryptedCookie($cookie->getName(), $cookie->getValue());
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'google-fixture', 'refresh_token' => 'refresh-fixture']),
            'www.googleapis.com/oauth2/v3/userinfo' => Http::response(['email' => 'verified@example.test']),
        ]);
        $this->get($callback.'?code=fixture&state='.$query['state'])->assertRedirect();
        Http::assertSent(fn ($r) => $r->url() === 'https://oauth2.googleapis.com/token' && $r['redirect_uri'] === $callback);
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'connected');
        $this->assertDatabaseCount('vibes_integration_installs', 1);
    }

    public function test_all_google_callbacks_share_the_configured_origin_and_empty_config_falls_back(): void
    {
        $oauth = app(ConnectorOAuth::class);
        foreach (['gmail', 'google_calendar', 'google_drive', 'google_tasks'] as $slug) {
            $this->assertSame('https://oauth.test/api/connectors/callback/'.$slug, $oauth->redirectUri($slug));
        }
        config(['chat_connectors.callback_base_url' => '']);
        $this->assertSame('https://marketing.test/api/connectors/callback/gmail', $oauth->redirectUri('gmail'));
    }

    public function test_one_provider_can_move_to_its_own_registered_origin_while_others_stay(): void
    {
        foreach (['gmail', 'google_calendar', 'google_drive', 'google_tasks'] as $slug)
            config(['chat_connectors.catalogue.'.$slug.'.oauth.callback_base_url' => 'https://brand.test/']);
        config(['chat_connectors.catalogue.github.oauth.client_id' => 'gh', 'chat_connectors.catalogue.github.oauth.client_secret' => 'gh-secret']);
        $oauth = app(ConnectorOAuth::class);
        foreach (['gmail', 'google_calendar', 'google_drive', 'google_tasks'] as $slug)
            $this->assertSame('https://brand.test/api/connectors/callback/'.$slug, $oauth->redirectUri($slug));
        $this->assertSame('https://oauth.test/api/connectors/callback/github', $oauth->redirectUri('github'));
        // The hop moves with the callback, so the host-only binding cookie still reaches it.
        $start = $this->postJson('/api/connectors/gmail/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        $this->assertStringStartsWith('https://brand.test/api/connectors/begin/', $start['url']);
        $hop = $this->pressHop($start['url'], $this->visitHop($start['url']))->assertRedirect();
        $this->assertSame('https://brand.test/api/connectors/callback/gmail', $this->queryOf($hop->headers->get('Location'))['redirect_uri']);
        $this->assertStringStartsWith('https://oauth.test/api/connectors/begin/',
            $this->postJson('/api/connectors/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json('url'));
    }

    public function test_shared_remote_mcp_hops_keep_their_own_origin_without_an_explicit_override(): void
    {
        $flows = app(OAuthFlows::class);
        $begun = $flows->begin(1, null, []);
        $this->assertStringStartsWith('https://marketing.test/api/connectors/begin/',
            $flows->entry($begun, 'https://provider.test/authorize', '/api/mcp/callback', 'MCP'));
    }
}
