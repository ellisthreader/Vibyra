<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationInvitation, User, VibyraSession};
use App\Services\Mcp\EndpointPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, RateLimiter};
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

/** Roadmap Part 13: a security pass over Teams: open redirect, login CSRF, SSRF, IDOR across teams, credentials, throttles, caching. */
class TeamsSecurityTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
    }

    public function test_the_callback_never_redirects_anywhere_a_request_names(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->configureSso();
        $this->person('ada@acme.test');
        $evil = 'https://evil.example/steal';
        // Success: every redirect-looking parameter is ignored, the destination is fixed.
        $r = $this->ssoSignIn('ada@acme.test', 'idp-user-1', fn (string $url) => $url.'&'.http_build_query(['redirect' => $evil, 'next' => $evil, 'return_to' => $evil, 'redirect_uri' => $evil, 'url' => $evil]));
        $this->assertSame(url('/account/team'), $r->headers->get('Location'));
        // Failure: a fixed code, never the provider's text or a target.
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test', 'redirect_uri' => $evil, 'next' => $evil])->json('authUrl');
        $this->assertStringNotContainsString('evil', $start, 'the authorization URL cannot be pointed elsewhere');
        parse_str(parse_url($start, PHP_URL_QUERY), $q);
        $this->assertSame(url('/auth/sso/callback'), $q['redirect_uri']);
        $r = $this->get('/auth/sso/callback?error=access_denied&error_description='.urlencode('<script>alert(1)</script>').'&next='.urlencode($evil).'&state='.$q['state']);
        $loc = $r->headers->get('Location');
        $this->assertSame('localhost', parse_url($loc, PHP_URL_HOST));
        $this->assertSame('/login', parse_url($loc, PHP_URL_PATH));
        $this->assertSame('sso_error=cancelled', parse_url($loc, PHP_URL_QUERY));
        $this->assertStringNotContainsString('script', $loc);
        $this->post('/auth/sso/callback')->assertStatus(405);
    }

    public function test_only_a_fixed_set_of_error_codes_can_ever_reach_the_login_page(): void
    {
        $codes = \App\Services\Teams\Sso\SsoException::CODES;
        $this->assertContains('sso_state', $codes);
        $this->assertSame(array_unique($codes), $codes);
        foreach ($codes as $code) $this->assertMatchesRegularExpression('/^[a-z_]+$/D', $code);
    }

    public function test_the_token_endpoint_is_ssrf_checked_again_at_sign_in_time(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->configureSso();
        $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        $link = $this->idp->authorize($start, 'ada@acme.test');
        // DNS now answers a private address for the provider (rebinding): nothing is sent to it.
        $this->app->instance(EndpointPolicy::class, new EndpointPolicy(fn () => ['10.0.0.5']));
        $before = $this->idp->log['/token'] ?? 0;
        $this->assertSame('sso_provider', $this->errorOf($this->get($link)));
        $this->assertSame($before, $this->idp->log['/token'] ?? 0);
        $this->assertGuest();
    }

    public function test_the_login_endpoints_are_throttled(): void
    {
        $this->configureSso();
        RateLimiter::clear('team-sso-start');
        $codes = [];
        foreach (range(1, 12) as $_) $codes[] = $this->postJson('/web-api/auth/sso/start', ['email' => 'x@acme.test'])->status();
        $this->assertContains(429, $codes);
        $this->assertSame(10, count(array_filter($codes, fn ($c) => $c !== 429)));
    }

    public function test_the_team_api_answers_to_a_browser_session_only_never_a_bearer_token_or_api_key(): void
    {
        [$org, $owner] = $this->team($this->person('boss@acme.test'), 'Acme');
        VibyraSession::create(['user_id' => $owner->id, 'token_hash' => hash('sha256', 'app-token'), 'last_used_at' => now()]);
        $this->withToken('app-token')->getJson('/web-api/team')->assertUnauthorized();
        $this->withToken('app-token')->postJson('/web-api/team/invitations', ['email' => 'x@acme.test'])->assertUnauthorized();
        config(['platform.api_keys' => true]);
        [$key, $secret] = app(\App\Services\Platform\ApiKeys::class)->create($owner->id, 'k', ['runs:read']);
        $this->withToken($secret)->getJson('/web-api/team')->assertUnauthorized();
        $this->withToken($secret)->deleteJson('/web-api/team/sso')->assertUnauthorized();
        $this->assertSame(0, OrganizationInvitation::count());
    }

    public function test_responses_are_not_cached_and_carry_no_secrets_or_hashes(): void
    {
        [$org, $owner] = $this->team($this->person('boss@acme.test'), 'Acme');
        \Illuminate\Support\Facades\Notification::fake();
        $this->actingAs($owner)->postJson('/web-api/team/invitations', ['email' => 'x@acme.test'])->assertCreated();
        $this->actingAs($owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk();
        $r = $this->getJson('/web-api/team');
        $this->assertStringContainsString('no-store', (string) $r->headers->get('Cache-Control'));
        $body = $r->getContent();
        foreach ([$this->idp->secret, 'token_hash', 'client_secret', 'domain_token', hash('sha256', $this->inviteToken('x@acme.test'))] as $secret) $this->assertStringNotContainsString($secret, $body);
        $this->assertSame(['issuer', 'clientId', 'hasSecret', 'domain', 'domainVerified', 'domainMethod', 'dns', 'enabled', 'requireSso'],
            array_values(array_diff(array_keys($r->json('sso')), ['visible', 'redirectUri', 'configured'])));
    }

    public function test_an_invitation_for_one_team_cannot_seat_someone_in_another_or_with_a_stolen_id(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        [$orgA, $ownerA] = $this->team($this->person(), 'A');
        [$orgB, $ownerB] = $this->team($this->person(), 'B');
        $this->actingAs($ownerA)->postJson('/web-api/team/invitations', ['email' => 'bob@x.test'])->assertCreated();
        $id = OrganizationInvitation::sole()->id;
        $token = $this->inviteToken('bob@x.test');
        // Knowing the id (not the secret) gets nothing; B's owner cannot see or revoke A's invitation.
        $bob = $this->person('bob@x.test');
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $id])->assertStatus(410);
        $this->actingAs($ownerB)->deleteJson('/web-api/team/invitations/'.$id)->assertNotFound();
        $this->assertSame([], $this->getJson('/web-api/team')->json('invitations'));
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertOk()->assertJsonPath('team.name', 'A');
    }

    public function test_the_sso_start_does_not_confirm_who_has_an_account(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->configureSso();
        $this->person('real@acme.test');
        $a = $this->postJson('/web-api/auth/sso/start', ['email' => 'real@acme.test'])->assertOk()->json();
        $b = $this->postJson('/web-api/auth/sso/start', ['email' => 'ghost@acme.test'])->assertOk()->json();
        $this->assertSame(array_keys($a), array_keys($b));
        $this->assertSame(parse_url($a['authUrl'], PHP_URL_PATH), parse_url($b['authUrl'], PHP_URL_PATH));
    }
}
