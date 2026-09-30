<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

class ConnectorOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'signed-in'), 'device_name' => 'iPhone']);
        $this->withToken('signed-in');
    }

    private function withGithubSignIn(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.github.oauth.client_id' => 'gh-client',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'gh-secret']);
    }

    /** Opens the provider's page with everything it needs, and keeps the state for the callback. */
    private function startGithub(string $returnUrl = 'vibyra://integrations/connected'): array
    {
        $start = $this->postJson('/api/connectors/github/start', ['returnUrl' => $returnUrl])->assertOk()->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        return [$start, $query];
    }

    public function test_signing_in_is_offered_only_where_this_server_can_complete_it(): void
    {
        $refused = $this->postJson('/api/connectors/github/start')->assertStatus(422);
        // Laravel words an abort as `message`; the app reads `error` first, then `message`.
        $this->assertSame('GitHub sign-in is not available right now. Please try again later.', $refused->json('error') ?? $refused->json('message'));
        $this->withGithubSignIn();
        $entries = array_column($this->getJson('/api/connectors')->json('integrations'), null, 'id');
        $this->assertSame('oauth', $entries['github']['credential']['kind']);
        $this->assertSame('oauth', $entries['stripe']['credential']['kind']);
        $this->assertTrue($entries['github']['credential']['configured']);
        $this->assertFalse($entries['stripe']['credential']['configured']);
    }

    public function test_the_sign_in_page_is_github_s_own_with_a_single_use_state(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $start['url']);
        $this->assertSame('gh-client', $query['client_id']);
        $this->assertSame('https://vibyra.test/api/connectors/callback/github', $query['redirect_uri']);
        $this->assertSame('repo', $query['scope']);
        $this->assertSame(48, strlen($query['state']));
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'pending');
    }

    /**
     * The whole round trip: GitHub sends the browser back with a code, the code
     * becomes a token that is proved and stored encrypted like a pasted key, and the
     * browser is sent on to the app with the outcome, which the app can read back.
     */
    public function test_a_github_sign_in_connects_the_account_and_returns_to_the_app(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in', 'token_type' => 'bearer']),
            'api.github.com/user' => Http::response(['login' => 'ellis']),
        ]);
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
        Http::assertSent(fn ($request) => $request->url() === 'https://github.com/login/oauth/access_token'
            && $request['code'] === 'the-code' && $request['client_secret'] === 'gh-secret'
            && $request['redirect_uri'] === 'https://vibyra.test/api/connectors/callback/github');
        $row = DB::table('vibes_integration_installs')->first();
        $this->assertSame('@ellis', $row->account_label);
        $this->assertStringNotContainsString('gho_signed_in', (string) $row->credential);
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'connected')
            ->assertJsonPath('catalogue.integrations.0.installed', true)->assertJsonPath('catalogue.integrations.0.account', '@ellis');

        // The state was single-use: replaying the same callback connects nothing again.
        DB::table('vibes_integration_installs')->delete();
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])->assertOk()->assertSee('GitHub was not connected');
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_cancelling_on_github_returns_to_the_app_and_says_so(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        Http::fake();
        $this->get('/api/connectors/callback/github?error=access_denied&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=failed');
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('error', 'You cancelled the sign-in.');
        Http::assertNothingSent();
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    /** The browser is only ever sent back into the app, never on to a web page someone supplied. */
    public function test_a_sign_in_never_redirects_anywhere_but_the_app(): void
    {
        $this->withGithubSignIn();
        [, $query] = $this->startGithub('https://evil.example/steal');
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in']),
            'api.github.com/user' => Http::response(['login' => 'ellis']),
        ]);
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertOk()->assertSee('GitHub is connected');
    }

    public function test_one_account_cannot_read_another_account_s_sign_in(): void
    {
        $this->withGithubSignIn();
        [$start] = $this->startGithub();
        $other = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'someone-else'), 'device_name' => 'iPhone']);
        $this->withToken('someone-else')->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('status', 'expired');
    }

    /** Stripe's token endpoint refuses fields it does not expect, so it is sent only its three. */
    public function test_a_stripe_sign_in_sends_its_token_endpoint_only_what_it_takes(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.stripe.oauth.client_id' => 'ca_platform',
            'chat_connectors.catalogue.stripe.oauth.client_secret' => 'sk_platform']);
        $start = $this->postJson('/api/connectors/stripe/start', ['returnUrl' => 'exp://127.0.0.1:8082/--/integrations/connected'])->json();
        $this->assertStringStartsWith('https://connect.stripe.com/oauth/authorize?', $start['url']);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertSame('read_write', $query['scope']);
        Http::fake([
            'connect.stripe.com/oauth/token' => Http::response(['access_token' => 'sk_connected', 'stripe_user_id' => 'acct_1']),
            'api.stripe.com/v1/account' => Http::response(['id' => 'acct_1', 'business_profile' => ['name' => 'Vibyra']]),
        ]);
        $this->get('/api/connectors/callback/stripe?code=ac_code&state='.$query['state'])
            ->assertRedirect('exp://127.0.0.1:8082/--/integrations/connected?flow='.$start['flowId'].'&status=connected');
        Http::assertSent(fn ($request) => $request->url() === 'https://connect.stripe.com/oauth/token'
            && array_keys($request->data()) === ['client_secret', 'code', 'grant_type']);
        $this->assertSame('Vibyra', DB::table('vibes_integration_installs')->first()->account_label);
    }
}
