<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\OAuthFlows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, OAuthHop};
use Tests\TestCase;

/**
 * F-01 residual: the hop link binds whichever browser opens it, so an attacker could forward the hop link itself.
 * The hop now stops at a first-party page that names the Vibyra account; only a POST (session CSRF token, single use)
 * sets the binding cookie and sends the browser on.
 */
class ConnectorHopConfirmationTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, OAuthHop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.github.oauth.client_id' => 'cid',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'csecret']);
        $this->user->forceFill(['email' => 'ellis.taylor@gmail.com', 'name' => 'Ellis Taylor'])->save();
        $this->route('POST', '#github\.com/login/oauth/access_token#', Http::response(['access_token' => 'gho_VICTIM_TOKEN']));
        $this->route('GET', '#api\.github\.com/user$#', Http::response(['login' => 'victim-octocat', 'id' => 42]));
    }

    private function start(array $body = []): array
    {
        return $this->postJson('/api/agents/v2/connections/github/start', $body)->assertOk()->json();
    }

    private function nonceCookies($response): array
    {
        return array_values(array_filter($response->headers->getCookies(), fn ($c) => str_starts_with($c->getName(), 'vb_oauth_')));
    }

    public function test_a_forwarded_hop_link_stops_at_a_confirmation_page_that_names_the_account(): void
    {
        $start = $this->start();
        [$page] = $visit = $this->visitHop($start['url']); // the victim's browser opens the link the attacker forwarded
        $page->assertOk()->assertSeeText('Connect GitHub to the Vibyra account e••••@gmail.com?', false)
            ->assertSee("This isn't my account", false);
        $this->assertNull($page->headers->get('Location'), 'GET never redirects to the provider.');
        $this->assertSame([], $this->nonceCookies($page), 'GET never sets the binding cookie.');
        $body = (string) $page->getContent();
        foreach (['ellis.taylor', 'Taylor', 'github.com', 'client_id', 'state=', $start['flowId'], 'gho_'] as $secret)
            $this->assertStringNotContainsString($secret, $body, 'The page shows the provider and the masked account, nothing else.');
        $this->assertStringNotContainsString('<script', $body);
        $this->visitHop($start['url'])[0]->assertOk(); // a prefetch or a second look does not spend the link
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'access_token'));
        $this->pressHop($start['url'], $visit, 'cancel')->assertOk();
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'failed');
    }

    public function test_the_page_cannot_be_framed_or_cached(): void
    {
        [$page] = $this->visitHop($this->start()['url']);
        $this->assertSame('DENY', $page->headers->get('X-Frame-Options'));
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $page->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('no-store', (string) $page->headers->get('Cache-Control'));
        $this->assertSame('no-referrer', $page->headers->get('Referrer-Policy'));
        $this->assertStringContainsString('prefers-color-scheme: dark', (string) $page->getContent());
        $this->assertStringContainsString('name="viewport"', (string) $page->getContent());
    }

    public function test_continue_with_a_valid_token_sets_the_scoped_cookie_and_sends_the_browser_to_the_provider(): void
    {
        $start = $this->start();
        $done = $this->pressHop($start['url'], $this->visitHop($start['url']))->assertStatus(302);
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $done->headers->get('Location'));
        $this->assertStringContainsString('no-store', (string) $done->headers->get('Cache-Control'));
        [$cookie] = $this->nonceCookies($done);
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertTrue($cookie->isSecure());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/api/connectors/callback/github', $cookie->getPath());
        $this->assertLessThanOrEqual(time() + 660, $cookie->getExpiresTime());
        $this->assertStringNotContainsString($cookie->getValue(), $done->headers->get('Location'), 'The nonce never travels through the provider.');
    }

    public function test_a_post_without_a_valid_token_changes_nothing_and_does_not_spend_the_link(): void
    {
        $start = $this->start();
        $visit = $this->visitHop($start['url']);
        foreach (['', 'not-the-token'] as $token) {
            $refused = $this->pressHop($start['url'], $visit, 'continue', $token);
            $refused->assertStatus(419);
            $this->assertSame([], $this->nonceCookies($refused));
            $this->assertNull($refused->headers->get('Location'));
        }
        $this->flushSession();
        $this->call('POST', $start['url'], ['_token' => 'forged', 'choice' => 'continue'])->assertStatus(419); // a cross-site form: no session cookie
        $this->pressHop($start['url'], $this->visitHop($start['url']), 'cancel', '')->assertStatus(419);
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertJsonPath('status', 'pending');
        $this->pressHop($start['url'], $visit)->assertStatus(302); // the real person can still continue
    }

    public function test_the_token_belongs_to_the_browser_that_was_shown_the_page(): void
    {
        $start = $this->start();
        $mine = $this->visitHop($start['url']);
        $attacker = $this->visitHop($start['url']);
        preg_match('/name="_token" value="([^"]+)"/', (string) $attacker[0]->getContent(), $theirs);
        $this->pressHop($start['url'], $mine, 'continue', $theirs[1])->assertStatus(419); // the attacker's token in the victim's session
    }

    public function test_the_flow_id_works_once_and_a_second_browser_or_a_replay_fails(): void
    {
        $start = $this->start();
        $first = $this->visitHop($start['url']);
        $second = $this->visitHop($start['url']); // a second browser loaded the page before the first continued
        $this->pressHop($start['url'], $first)->assertStatus(302);
        $replay = $this->pressHop($start['url'], $first);
        $late = $this->pressHop($start['url'], $second);
        foreach ([$replay, $late] as $response) {
            $response->assertStatus(404);
            $this->assertSame([], $this->nonceCookies($response));
            $this->assertNull($response->headers->get('Location'));
        }
        $this->visitHop($start['url'])[0]->assertStatus(404)->assertSee('already been used');
        $this->visitHop('https://vibyra.test/api/connectors/begin/'.\Illuminate\Support\Str::uuid())[0]->assertStatus(404);
    }

    public function test_cancel_fails_the_flow_for_the_app_and_burns_the_provider_state(): void
    {
        $start = $this->start(['returnUrl' => 'vibyra://integrations/connected']);
        $done = $this->pressHop($start['url'], $this->visitHop($start['url']), 'cancel');
        $done->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=failed');
        $this->assertSame([], $this->nonceCookies($done));
        $this->withToken('v2-session')->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])
            ->assertJsonPath('status', 'failed')->assertJsonPath('error', 'You cancelled the sign-in.');
        $this->visitHop($start['url'])[0]->assertStatus(404);

        $flows = app(OAuthFlows::class); // the provider's state cannot be finished afterwards, even by a browser that holds the nonce
        $begun = $flows->begin($this->user->id, null, ['slug' => 'github', 'mode' => 'install']);
        $url = $flows->entry($begun, 'https://github.com/login/oauth/authorize?state='.$begun['state'], '/api/connectors/callback/github', 'GitHub');
        $this->pressHop($url, $this->visitHop($url), 'cancel')->assertOk()->assertSee('GitHub was not connected');
        $this->assertNull($flows->claim($begun['state'], $begun['nonce']));
        $this->assertSame('failed', $flows->status($begun['flowId'], $this->user->id)['status']);
    }

    public function test_every_connect_path_names_its_own_provider_on_the_page(): void
    {
        $chat = $this->postJson('/api/connectors/github/start', [])->assertOk()->json('url');
        $this->visitHop($chat)[0]->assertOk()->assertSee('Connect GitHub to the Vibyra account', false);
        $this->visitHop($this->start()['url'])[0]->assertOk()->assertSee('Connect GitHub to the Vibyra account', false);
        $flows = app(OAuthFlows::class);
        $begun = $flows->begin($this->user->id, null, ['kind' => 'composio']);
        $url = $flows->entry($begun, 'https://connect.composio.dev/link/abc', '/api/agents/v2/composio/callback', "Air<b>table");
        $this->visitHop($url)[0]->assertOk()->assertSee('Connect Air&lt;b&gt;table to the Vibyra account', false);
    }

    public function test_the_legitimate_flow_still_connects_after_the_confirmation(): void
    {
        $start = $this->start(['returnUrl' => 'vibyra://integrations/connected']);
        $state = $this->queryOf($this->openSignIn($start['url']))['state'];
        $this->get('/api/connectors/callback/github?state='.$state.'&code=mine')
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
        $this->assertTrue(DB::table('agent_connections')->where('user_id', $this->user->id)->where('provider', 'github')->exists());
    }
}
