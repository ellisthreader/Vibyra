<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\ChatConnectors\Installs;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\TestCase;

/**
 * Figma hands out an access token that stops working after ninety days, together
 * with a refresh token to trade for the next one. Keeping only the access token
 * made every Figma connection die three months in while the catalogue still
 * reported it as connected, so these cover the whole grant being kept and spent.
 */
class ConnectorTokenRenewalTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'app.url' => 'https://vibyra.test',
            'chat_connectors.catalogue.figma.oauth.client_id' => 'fig-client',
            'chat_connectors.catalogue.figma.oauth.client_secret' => 'fig-secret']);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'signed-in'), 'device_name' => 'iPhone']);
        $this->withToken('signed-in');
    }

    /** Sign in to Figma for real, through the callback, so the stored row is the one production writes. */
    private function connectFigma(int $expiresIn = 7776000): void
    {
        $start = $this->postJson('/api/connectors/figma/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        Http::fake([
            'api.figma.com/v1/oauth/token' => Http::response(['access_token' => 'figd_first', 'token_type' => 'bearer',
                'expires_in' => $expiresIn, 'refresh_token' => 'figr_renewal']),
            'api.figma.com/v1/me' => Http::response(['handle' => 'ellis', 'email' => 'ellis@example.com']),
        ]);
        $this->get('/api/connectors/callback/figma?code=the-code&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
    }

    public function test_the_refresh_token_and_expiry_are_kept_and_never_stored_in_the_clear(): void
    {
        $this->connectFigma();
        $row = DB::table('vibes_integration_installs')->where('integration', 'figma')->first();
        $this->assertNotNull($row->refresh_token);
        $this->assertNotNull($row->expires_at);
        // Encrypted at rest exactly like the access token, and never handed to a client.
        $this->assertStringNotContainsString('figr_renewal', (string) $row->refresh_token);
        $this->assertSame('figr_renewal', Crypt::decryptString($row->refresh_token));
        $catalogue = $this->getJson('/api/connectors')->json('integrations');
        $this->assertStringNotContainsString('figr_renewal', json_encode($catalogue));
    }

    public function test_an_expired_figma_token_is_renewed_before_the_call_that_needs_it(): void
    {
        $this->connectFigma();
        // Ninety days on: the stored access token is past its life.
        DB::table('vibes_integration_installs')->where('integration', 'figma')->update(['expires_at' => now()->subDay()]);
        Http::fake(['api.figma.com/v1/oauth/refresh' => Http::response(['access_token' => 'figd_second',
            'token_type' => 'bearer', 'expires_in' => 7776000])]);

        $credential = app(Installs::class)->credential($this->user->id, 'figma');

        $this->assertSame('figd_second', $credential);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.figma.com/v1/oauth/refresh'
            && $request['refresh_token'] === 'figr_renewal'
            // Figma identifies the app over Basic auth on this endpoint, not as body fields.
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('fig-client:fig-secret')));
        $row = DB::table('vibes_integration_installs')->where('integration', 'figma')->first();
        $this->assertSame('figd_second', Crypt::decryptString($row->credential));
        // Figma returns no new refresh token here, so the stored one has to survive.
        $this->assertSame('figr_renewal', Crypt::decryptString($row->refresh_token));
        $this->assertTrue(now()->addDays(80)->lessThan($row->expires_at));
    }

    public function test_a_token_with_life_left_is_spent_as_it_is(): void
    {
        $this->connectFigma();
        Http::fake(['api.figma.com/v1/oauth/refresh' => Http::response([], 500)]);
        $this->assertSame('figd_first', app(Installs::class)->credential($this->user->id, 'figma'));
        Http::assertNothingSent();
    }

    /**
     * A refusal must not throw away a connection this code cannot prove is dead:
     * the stored token is still handed over, to fail on the provider's own terms.
     */
    public function test_a_refused_renewal_leaves_the_connection_alone(): void
    {
        $this->connectFigma();
        DB::table('vibes_integration_installs')->where('integration', 'figma')->update(['expires_at' => now()->subDay()]);
        Http::fake(['api.figma.com/v1/oauth/refresh' => Http::response(['error' => 'invalid_grant'], 400)]);

        $this->assertSame('figd_first', app(Installs::class)->credential($this->user->id, 'figma'));
        $row = DB::table('vibes_integration_installs')->where('integration', 'figma')->first();
        $this->assertSame('figr_renewal', Crypt::decryptString($row->refresh_token));
        $this->getJson('/api/connectors')->assertOk();
    }

    /** GitHub declares no refresh endpoint, so nothing about it changed. */
    public function test_a_provider_whose_tokens_do_not_expire_never_renews(): void
    {
        config(['chat_connectors.catalogue.github.oauth.client_id' => 'gh-client',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'gh-secret']);
        $start = $this->postJson('/api/connectors/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in', 'token_type' => 'bearer']),
            'api.github.com/user' => Http::response(['login' => 'ellis']),
        ]);
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state']);

        $row = DB::table('vibes_integration_installs')->where('integration', 'github')->first();
        $this->assertNull($row->refresh_token);
        $this->assertNull($row->expires_at);
        Http::fake();
        $this->assertSame('gho_signed_in', app(Installs::class)->credential($this->user->id, 'github'));
        Http::assertNothingSent();
    }
}
