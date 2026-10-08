<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\ChatConnectors\{ConnectorTools, Installs};
use App\Services\ChatConnectors\Stripe\Auth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Support\OAuthHop;
use Tests\TestCase;

/**
 * Stripe Connect's token response no longer carries a usable `access_token` (deprecated): it returns the connected
 * account's id, and every call is made with the platform's secret key plus a Stripe-Account header. These cover that
 * sign-in end to end, that a pasted `acct_...` can never stand in for it, and that disconnecting deauthorizes.
 */
class StripeConnectOAuthTest extends TestCase
{
    use RefreshDatabase, OAuthHop;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.stripe.oauth.client_id' => 'ca_platform',
            'chat_connectors.catalogue.stripe.oauth.client_secret' => 'sk_live_platform']);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'signed-in'), 'device_name' => 'iPhone']);
        $this->withToken('signed-in');
    }

    private function signIn(array $token = ['stripe_user_id' => 'acct_1Connected', 'livemode' => true, 'scope' => 'read_write', 'token_type' => 'bearer']): void
    {
        $start = $this->postJson('/api/connectors/stripe/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        Http::fake(['connect.stripe.com/oauth/token' => Http::response($token),
            'api.stripe.com/v1/account' => Http::response(['id' => 'acct_1Connected', 'business_profile' => ['name' => 'Acme Ltd']])]);
        $this->get('/api/connectors/callback/stripe?code=ac_code&state='.$query['state'])->assertRedirect();
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('status', 'connected');
    }

    private function stored(): string
    {
        return Crypt::decryptString(DB::table('vibes_integration_installs')->where('integration', 'stripe')->value('credential'));
    }

    public function test_a_sign_in_that_returns_only_the_account_id_connects_and_calls_as_that_account(): void
    {
        $this->signIn();
        $this->assertSame(Auth::wrap('acct_1Connected'), $this->stored());
        $this->assertSame('Acme Ltd', DB::table('vibes_integration_installs')->value('account_label'));
        // The connect call itself already went out as the connected account, with the platform key.
        Http::assertSent(fn ($r) => $r->url() === 'https://api.stripe.com/v1/account'
            && $r->hasHeader('Authorization', 'Bearer sk_live_platform') && $r->hasHeader('Stripe-Account', 'acct_1Connected'));
        Http::fake(['api.stripe.com/v1/balance' => Http::response(['livemode' => true, 'available' => [['amount' => 500, 'currency' => 'gbp']], 'pending' => []])]);
        $out = app(ConnectorTools::class)->run($this->user->id, 'stripe', 'stripe_balance', []);
        $this->assertSame('Read your Stripe balance', $out['summary']);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/v1/balance') && $r->hasHeader('Stripe-Account', 'acct_1Connected'));
    }

    public function test_a_test_mode_sign_in_says_so_in_its_label(): void
    {
        config(['chat_connectors.catalogue.stripe.oauth.client_secret' => 'sk_test_platform']);
        $this->signIn(['stripe_user_id' => 'acct_1Connected', 'livemode' => false]);
        $this->assertSame('Acme Ltd (test mode)', DB::table('vibes_integration_installs')->value('account_label'));
    }

    public function test_a_response_without_an_account_id_or_token_connects_nothing(): void
    {
        $start = $this->postJson('/api/connectors/stripe/start', ['returnUrl' => 'vibyra://integrations/connected'])->json();
        $query = $this->queryOf($this->openSignIn($start['url']));
        Http::fake(['connect.stripe.com/oauth/token' => Http::response(['error' => 'invalid_grant', 'error_description' => 'Authorization code does not exist'], 400)]);
        $this->get('/api/connectors/callback/stripe?code=ac_code&state='.$query['state'])->assertRedirect();
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('status', 'failed');
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_a_pasted_account_id_or_forged_marker_never_borrows_the_platform_key(): void
    {
        Http::fake(['api.stripe.com/v1/*' => Http::response(['error' => ['message' => 'Invalid API Key provided']], 401)]);
        foreach (['acct_1Victim', 'vbacct.acct_1Victim.'.str_repeat('a', 64)] as $pasted) {
            $this->postJson('/api/connectors/stripe/connect', ['credential' => $pasted])->assertStatus(422);
        }
        Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer acct_1Victim'));
        Http::assertNotSent(fn ($r) => $r->hasHeader('Stripe-Account') || str_contains((string) $r->header('Authorization')[0], 'sk_live_platform'));
        $this->assertNull(Auth::account('vbacct.acct_1Victim.'.str_repeat('a', 64)));
        $this->assertSame('acct_1Victim', Auth::account(Auth::wrap('acct_1Victim')));
    }

    public function test_disconnecting_deauthorizes_a_sign_in_and_still_disconnects_when_stripe_is_down(): void
    {
        $this->signIn();
        Http::fake(['connect.stripe.com/oauth/deauthorize' => Http::response(['error' => 'down'], 500)]);
        $this->postJson('/api/connectors/stripe/disconnect')->assertOk();
        Http::assertSent(fn ($r) => $r->url() === 'https://connect.stripe.com/oauth/deauthorize'
            && $r['client_id'] === 'ca_platform' && $r['stripe_user_id'] === 'acct_1Connected'
            && $r->hasHeader('Authorization', 'Basic '.base64_encode('sk_live_platform:')));
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_disconnecting_a_pasted_key_does_not_call_stripe_connect(): void
    {
        Http::fake(['api.stripe.com/v1/account' => Http::response(['id' => 'acct_own'])]);
        app(Installs::class)->connect($this->user->id, 'stripe', 'rk_live_pasted');
        Http::fake();
        $this->postJson('/api/connectors/stripe/disconnect')->assertOk();
        Http::assertNothingSent();
    }

    public function test_disconnecting_an_extra_agent_account_revokes_stripe_after_local_access_ends(): void
    {
        $row = \App\Models\AgentV2\Connection::query()->create(['user_id' => $this->user->id,
            'provider' => 'stripe', 'external_identity' => 'Extra account', 'generation' => 1,
            'capability_revision' => 1, 'health' => 'healthy',
            'credential' => Crypt::encryptString(Auth::wrap('acct_1Extra'))]);
        Http::fake(['connect.stripe.com/oauth/deauthorize' => function () use ($row) {
            $this->assertNull($row->fresh()->credential);
            $this->assertNotNull($row->fresh()->revoked_at);
            return Http::response(['error' => 'temporarily unavailable'], 500);
        }]);
        app(\App\Services\AgentRuns\Connections\Disconnect::class)->remove($this->user->id, $row->id);
        Http::assertSent(fn ($r) => $r['stripe_user_id'] === 'acct_1Extra');
        $this->assertSame('revoked', $row->fresh()->health);
        app(\App\Services\AgentRuns\Connections\Disconnect::class)->remove($this->user->id, $row->id);
        Http::assertSentCount(1);
    }

    public function test_stripe_failures_are_worded_by_cause_not_as_an_outage(): void
    {
        $this->signIn();
        $tools = app(ConnectorTools::class);
        Http::fake(['api.stripe.com/v1/balance' => Http::sequence()
            ->push(['error' => ['code' => 'account_invalid']], 403)->push(['error' => ['code' => 'permission']], 403)
            ->push(['error' => ['code' => 'api_key_expired']], 401)->push([], 503)]);
        $this->assertStringContainsString('reconnected', $tools->run($this->user->id, 'stripe', 'stripe_balance', [])['summary']);
        $this->assertStringContainsString('not allowed to read', $tools->run($this->user->id, 'stripe', 'stripe_balance', [])['result']['error']);
        $this->assertStringContainsString('setup problem', $tools->run($this->user->id, 'stripe', 'stripe_balance', [])['result']['error']);
        $this->assertStringContainsString('could not be reached', $tools->run($this->user->id, 'stripe', 'stripe_balance', [])['result']['error']);
    }
}
