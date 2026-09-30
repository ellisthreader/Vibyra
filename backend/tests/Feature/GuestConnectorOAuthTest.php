<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GuestConnectorOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.enabled' => true,
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        foreach (['github', 'stripe'] as $slug) {
            config(['chat_connectors.catalogue.'.$slug.'.oauth.client_id' => 'client',
                'chat_connectors.catalogue.'.$slug.'.oauth.client_secret' => 'secret']);
        }
        Http::preventStrayRequests();
    }

    private function guest(string $token): User
    {
        $user = User::factory()->create(['guest_at' => now(), 'provider' => 'guest', 'email_verified_at' => null]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'iPhone']);
        $this->withToken($token);
        return $user;
    }

    private function start(string $slug = 'github'): array
    {
        $flow = $this->postJson('/api/connectors/'.$slug.'/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        parse_str(parse_url($flow['url'], PHP_URL_QUERY), $query);
        return [$flow, $query];
    }

    public function test_both_providers_persist_on_the_existing_guest_without_creating_a_login(): void
    {
        $guest = $this->guest('guest-one');
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'github-fixture']),
            'api.github.com/user' => Http::response(['login' => 'octocat']),
            'connect.stripe.com/oauth/token' => Http::response(['access_token' => 'stripe-fixture']),
            'api.stripe.com/v1/account' => Http::response(['id' => 'acct_fixture']),
        ]);
        foreach (['github', 'stripe'] as $slug) {
            [$flow, $query] = $this->start($slug);
            $this->withToken('')->get('/api/connectors/callback/'.$slug.'?code=fixture&state='.$query['state'])->assertRedirect();
            $result = $this->withToken('guest-one')->getJson('/api/connectors/flows/'.$flow['flowId'])
                ->assertOk()->assertJsonPath('status', 'connected')->json();
            $this->assertArrayNotHasKey('session', $result);
            $this->assertDatabaseHas('vibes_integration_installs', ['user_id' => $guest->id, 'integration' => $slug]);
        }
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('vibyra_sessions', 1);
        $this->assertTrue($guest->fresh()->isGuest());
        $this->getJson('/api/connectors')->assertJsonPath('integrations.0.installed', true)->assertJsonPath('integrations.1.installed', true);
        $this->postJson('/api/connectors/github/disconnect')->assertOk()->assertJsonPath('integrations.0.installed', false);
        $this->assertDatabaseCount('vibes_integration_installs', 1);
    }

    public function test_guests_are_isolated_and_mutations_still_require_a_bearer(): void
    {
        $this->withToken('')->postJson('/api/connectors/github/start')->assertUnauthorized();
        $this->guest('one');
        [$flow] = $this->start();
        Http::fake(['api.github.com/user' => Http::response(['login' => 'octocat'])]);
        $this->postJson('/api/connectors/github/connect', ['credential' => 'fixture'])->assertOk();
        $this->guest('two');
        $this->getJson('/api/connectors/flows/'.$flow['flowId'])->assertJsonPath('status', 'expired');
        $this->getJson('/api/connectors')->assertJsonPath('integrations.0.installed', false);
        $this->postJson('/api/connectors/github/disconnect')->assertOk();
        $this->assertDatabaseCount('vibes_integration_installs', 1);
        $this->getJson('/api/session')->assertForbidden();
    }

    public function test_free_accounts_can_start_both_providers_without_email_verification(): void
    {
        foreach ([null, now()] as $verified) {
            $user = User::factory()->create(['email_verified_at' => $verified]);
            $token = 'account-'.$user->id;
            VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'iPhone']);
            $this->withToken($token);
            foreach (['github', 'stripe'] as $slug) {
                [$flow] = $this->start($slug);
                $this->getJson('/api/connectors/flows/'.$flow['flowId'])->assertOk()->assertJsonPath('status', 'pending');
            }
        }
        Http::assertNothingSent();
    }

    public function test_github_pkce_verifier_is_server_owned_and_matches_the_challenge(): void
    {
        $this->guest('one');
        [, $query] = $this->start();
        $this->assertSame('S256', $query['code_challenge_method']);
        $this->assertArrayNotHasKey('code_verifier', $query);
        Http::fake(['github.com/login/oauth/access_token' => Http::response(['access_token' => 'fixture']),
            'api.github.com/user' => Http::response(['login' => 'octocat'])]);
        $this->get('/api/connectors/callback/github?code=fixture&state='.$query['state'])->assertRedirect();
        Http::assertSent(fn ($request) => $request->url() === 'https://github.com/login/oauth/access_token'
            && rtrim(strtr(base64_encode(hash('sha256', $request['code_verifier'], true)), '+/', '-_'), '=') === $query['code_challenge']);
    }

    public function test_provider_timeout_returns_to_the_app_as_a_failure(): void
    {
        $this->guest('one');
        [$flow, $query] = $this->start();
        Http::fake(['github.com/login/oauth/access_token' => Http::failedConnection()]);
        $this->get('/api/connectors/callback/github?code=fixture&state='.$query['state'])->assertRedirect();
        $this->getJson('/api/connectors/flows/'.$flow['flowId'])->assertJsonPath('status', 'failed');
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_expired_and_wrong_provider_callbacks_cannot_connect(): void
    {
        $this->guest('one');
        [, $query] = $this->start();
        $this->get('/api/connectors/callback/stripe?code=fixture&state='.$query['state'])->assertOk();
        [, $query] = $this->start();
        $this->travel(11)->minutes();
        $this->get('/api/connectors/callback/github?code=fixture&state='.$query['state'])->assertOk();
        Http::assertNothingSent();
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }
}
