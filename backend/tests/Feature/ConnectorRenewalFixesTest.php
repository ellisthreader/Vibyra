<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\ChatConnectors\{ConnectorOAuth, Installs, ReconnectRequired};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Support\OAuthHop;
use Tests\TestCase;

/**
 * Renewal behaviour that differs per provider: Notion states no lifetime, Linear wants its secret and rotates, Slack
 * refuses with HTTP 200, and an expired app secret must not tell every person to sign in again.
 */
class ConnectorRenewalFixesTest extends TestCase
{
    use RefreshDatabase, OAuthHop;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)), 'app.url' => 'https://vibyra.test']);
        foreach (['notion', 'linear', 'slack', 'outlook_mail'] as $slug) {
            config(['chat_connectors.catalogue.'.$slug.'.oauth.client_id' => $slug.'-id', 'chat_connectors.catalogue.'.$slug.'.oauth.client_secret' => $slug.'-secret']);
        }
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'signed-in'), 'device_name' => 'iPhone']);
        $this->withToken('signed-in');
    }

    public function test_a_notion_token_with_no_stated_lifetime_is_renewed_before_it_can_die(): void
    {
        $start = $this->postJson('/api/connectors/notion/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        Http::fake(['api.notion.com/v1/oauth/token' => Http::sequence()
            ->push(['access_token' => 'ntn_1', 'refresh_token' => 'ntr_1', 'bot_id' => 'b'])->push(['access_token' => 'ntn_2', 'refresh_token' => 'ntr_2']),
            'api.notion.com/v1/users/me' => Http::response(['bot' => ['workspace_name' => 'Acme HQ']])]);
        $this->get('/api/connectors/callback/notion?code=c&state='.$query['state'])->assertRedirect();
        $row = DB::table('vibes_integration_installs')->where('integration', 'notion')->first();
        $this->assertNotNull($row->refresh_token);
        $this->assertTrue(Carbon::parse($row->expires_at)->between(now()->addMinutes(89), now()->addMinutes(91)));

        // Inside the first half hour it is spent as it is; after that it is renewed first.
        $tokenCalls = fn () => Http::recorded(fn ($r) => str_ends_with($r->url(), '/v1/oauth/token'))->count();
        $this->assertSame('ntn_1', app(Installs::class)->credential($this->user->id, 'notion'));
        $this->assertSame(1, $tokenCalls());
        Carbon::setTestNow(now()->addMinutes(40));
        $this->assertSame('ntn_2', app(Installs::class)->credential($this->user->id, 'notion'));
        Http::assertSent(fn ($r) => ($r->data()['grant_type'] ?? null) === 'refresh_token' && $r['refresh_token'] === 'ntr_1'
            && $r->hasHeader('Authorization', 'Basic '.base64_encode('notion-id:notion-secret')));
        $this->assertSame('ntr_2', Crypt::decryptString(DB::table('vibes_integration_installs')->value('refresh_token')));
        $this->assertSame('ntn_2', app(Installs::class)->credential($this->user->id, 'notion'));
        $this->assertSame(2, $tokenCalls());
        Carbon::setTestNow();
    }

    public function test_linear_refresh_sends_its_secret_and_tells_a_dead_grant_from_a_dead_app_secret(): void
    {
        $oauth = app(ConnectorOAuth::class);
        Http::fake(['api.linear.app/oauth/token' => Http::sequence()
            ->push(['access_token' => 'lin_2', 'refresh_token' => 'lir_2', 'expires_in' => 86399])
            ->push(['error' => 'invalid_grant'], 400)->push(['error' => 'invalid_client'], 401)]);
        $this->assertSame('lir_2', $oauth->renew('linear', 'lir_1')['refresh']);
        Http::assertSent(fn ($r) => $r['client_id'] === 'linear-id' && $r['client_secret'] === 'linear-secret' && $r['refresh_token'] === 'lir_1');
        try { $oauth->renew('linear', 'lir_2'); $this->fail('A dead refresh token needs a new sign-in.'); }
        catch (ReconnectRequired $e) { $this->assertStringContainsString('reconnected', $e->getMessage()); }
        // Vibyra's own client secret being refused says nothing about the person's sign-in.
        $this->assertNull($oauth->renew('linear', 'lir_2'));
    }

    public function test_slack_refuses_a_dead_refresh_token_with_http_200_and_that_still_means_sign_in_again(): void
    {
        $oauth = app(ConnectorOAuth::class);
        Http::fake(['slack.com/api/oauth.v2.access' => Http::sequence()
            ->push(['ok' => true, 'access_token' => 'xoxe.xoxb-2', 'refresh_token' => 'xoxe-2', 'expires_in' => 43200])
            ->push(['ok' => false, 'error' => 'invalid_refresh_token'])->push(['ok' => false, 'error' => 'invalid_client_id'])]);
        $grant = $oauth->renew('slack', 'xoxe-1');
        $this->assertSame(['xoxe.xoxb-2', 'xoxe-2', 43200], [$grant['access'], $grant['refresh'], $grant['expires_in']]);
        $this->expectException(ReconnectRequired::class);
        $oauth->renew('slack', 'xoxe-2');
    }

    public function test_microsoft_refusing_the_app_secret_is_not_a_reason_to_reconnect(): void
    {
        $oauth = app(ConnectorOAuth::class);
        Http::fake(['login.microsoftonline.com/*' => Http::sequence()
            ->push(['error' => 'invalid_client', 'error_description' => 'AADSTS7000222: client secret keys are expired'], 401)
            ->push(['error' => 'invalid_grant', 'error_description' => 'AADSTS700082: refresh token expired'], 400)]);
        $this->assertNull($oauth->renew('outlook_mail', 'old'));
        $this->expectException(ReconnectRequired::class);
        $oauth->renew('outlook_mail', 'old');
    }

    public function test_two_calls_after_expiry_renew_once(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'linear',
            'credential' => Crypt::encryptString('lin_old'), 'refresh_token' => Crypt::encryptString('lir_old'), 'expires_at' => now()->subMinute(),
            'account_label' => 'Sam', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        Http::fake(['api.linear.app/oauth/token' => Http::response(['access_token' => 'lin_new', 'refresh_token' => 'lir_new', 'expires_in' => 86399])]);
        $installs = app(Installs::class);
        $this->assertSame('lin_new', $installs->credential($this->user->id, 'linear'));
        $this->assertSame('lin_new', $installs->credential($this->user->id, 'linear'));
        Http::assertSentCount(1);
    }
}
