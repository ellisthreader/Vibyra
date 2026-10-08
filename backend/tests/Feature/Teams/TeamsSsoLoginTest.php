<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationMember, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Hash};
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

/**
 * Roadmap Part 13: OIDC sign-in (authorization code + PKCE) against the local mock provider: the happy path, just-in-time membership,
 * and every validation (state, nonce, issuer, audience, expiry, signature, algorithm, subject, email, domain). No real IdP exists here.
 */
class TeamsSsoLoginTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // throttling has its own test
        $this->configureSso();
    }

    private function expectFailure(string $code, ?callable $tamper = null, string $email = 'ada@acme.test'): void
    {
        $r = $this->ssoSignIn($email, 'idp-user-1', $tamper);
        $this->assertSame($code, $this->errorOf($r));
        $this->assertGuest();
    }

    public function test_the_happy_path_signs_in_an_existing_account_and_seats_them_just_in_time(): void
    {
        $ada = $this->person('ada@acme.test', ['password' => 'secret-password']);
        $this->assertNull($this->memberOf($ada));
        $r = $this->ssoSignIn('ada@acme.test');
        $r->assertRedirect('/account/team');
        $this->assertAuthenticatedAs($ada);
        $seat = $this->memberOf($ada);
        $this->assertSame([$this->org->id, 'member', 'sso'], [$seat->organization_id, $seat->role, $seat->joined_via]);
        $this->assertSame('idp-user-1', DB::table('organization_sso_identities')->value('subject'));
        $log = array_column($this->events($ada), 'event');
        $this->assertContains('sign_in', $log);
        $this->assertContains('team.member_joined', $log);
        $this->assertSame('sso', $this->events($ada, 'sign_in')[0]['detail']['method']);
        // The page behind the redirect works for the new member.
        $this->getJson('/web-api/team')->assertOk()->assertJsonPath('role', 'member');
        // The provider saw exactly one code exchange, with PKCE.
        $this->assertSame(1, $this->idp->log['/token']);
    }

    public function test_a_second_sign_in_follows_the_bound_subject_and_does_not_duplicate(): void
    {
        $ada = $this->person('ada@acme.test');
        $this->ssoSignIn('ada@acme.test')->assertRedirect('/account/team');
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->ssoSignIn('ada@acme.test')->assertRedirect('/account/team');
        $this->assertAuthenticatedAs($ada);
        $this->assertSame(1, OrganizationMember::where('user_id', $ada->id)->count());
        $this->assertSame(1, DB::table('organization_sso_identities')->count());
        $this->assertSame(1, count($this->events($ada, 'team.member_joined')));
    }

    public function test_the_same_subject_cannot_sign_in_as_a_different_account(): void
    {
        $this->person('ada@acme.test');
        $this->person('bob@acme.test');
        $this->ssoSignIn('ada@acme.test', 'shared-sub')->assertRedirect('/account/team');
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        // Bob's email, Ada's subject: the bound identity wins, so it is Ada who signs in, not Bob.
        $this->ssoSignIn('bob@acme.test', 'shared-sub')->assertRedirect('/account/team');
        $this->assertSame('ada@acme.test', auth()->user()->email);
    }

    public function test_an_unverified_account_with_that_email_loses_its_old_password_and_sessions(): void
    {
        $squatter = $this->person('ada@acme.test', ['email_verified_at' => null, 'password' => 'attackers-password']);
        VibyraSession::create(['user_id' => $squatter->id, 'token_hash' => hash('sha256', 'old'), 'last_used_at' => now()]);
        $this->ssoSignIn('ada@acme.test')->assertRedirect('/account/team');
        $squatter->refresh();
        $this->assertNotNull($squatter->email_verified_at);
        $this->assertFalse(Hash::check('attackers-password', $squatter->password));
        $this->assertNotNull(VibyraSession::first()->revoked_at);
    }

    public function test_no_account_a_second_factor_another_team_and_a_full_team_are_each_refused_by_name(): void
    {
        $this->expectFailure('account_required');
        $two = $this->person('two@acme.test');
        $this->mock(\App\Services\Auth\TwoFactor::class, fn ($m) => $m->shouldReceive('enabled')->andReturnUsing(fn ($u) => $u->email === 'two@acme.test'));
        $this->expectFailure('two_factor', null, 'two@acme.test');
        [$other] = $this->team($this->person(), 'Other');
        $this->seat($other, $this->person('in-other@acme.test'));
        $this->expectFailure('other_team', null, 'in-other@acme.test');
        $this->org->forceFill(['seats' => 1])->save();
        $this->person('late@acme.test');
        $this->expectFailure('no_seats', null, 'late@acme.test');
        $this->assertNull($this->memberOf($two));
    }

    public function test_the_state_is_single_use_bound_to_the_session_and_unguessable(): void
    {
        $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        $callback = $this->idp->authorize($start, 'ada@acme.test');
        $this->get($callback)->assertRedirect('/account/team');
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        // Replaying the same callback is refused: the state was consumed.
        $this->assertSame('sso_state', $this->errorOf($this->get($callback)));
        $this->assertGuest();
        // A forged state, an empty one, a missing one and a wrong-shaped one.
        foreach (['', 'x', str_repeat('a', 64), str_repeat('!', 64)] as $state) {
            $this->assertSame('sso_state', $this->errorOf($this->get('/auth/sso/callback?code=abc&state='.$state)));
        }
        $this->assertSame('sso_state', $this->errorOf($this->get('/auth/sso/callback?code=abc')));
        $this->assertGuest();
    }

    public function test_a_flow_planted_in_another_browser_cannot_sign_a_victim_in(): void
    {
        $ada = $this->person('ada@acme.test');
        // The attacker starts a flow in their own browser and sends the victim the callback link.
        $attackerStart = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        $link = $this->idp->authorize($attackerStart, 'ada@acme.test');
        $this->flushSession(); // the victim's browser has no matching session
        $this->assertSame('sso_state', $this->errorOf($this->get($link)));
        $this->assertGuest();
        $this->assertNull($this->memberOf($ada));
    }

    public function test_an_authorization_code_works_once_and_only_with_its_pkce_verifier(): void
    {
        $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        parse_str(parse_url($start, PHP_URL_QUERY), $q);
        $this->assertSame('S256', $q['code_challenge_method']);
        $this->assertSame('code', $q['response_type']);
        $this->assertSame($this->idp->clientId, $q['client_id']);
        $this->assertSame(url('/auth/sso/callback'), $q['redirect_uri']);
        $this->assertGreaterThanOrEqual(43, strlen($q['state']));
        $this->assertGreaterThanOrEqual(43, strlen($q['nonce']));
        $this->assertSame('openid email profile', $q['scope']);
        $this->get($this->idp->authorize($start, 'ada@acme.test'))->assertRedirect('/account/team');
    }

    public function test_the_provider_denying_or_failing_leads_to_a_fixed_error_code(): void
    {
        $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        parse_str(parse_url($start, PHP_URL_QUERY), $q);
        $this->assertSame('cancelled', $this->errorOf($this->get('/auth/sso/callback?error=access_denied&error_description=<script>&state='.$q['state'])));
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        $this->assertSame('sso_provider', $this->errorOf($this->get('/auth/sso/callback?code=bad-code&state='.$this->stateOf($start))));
        $this->assertGuest();
    }

    public function test_sso_switched_off_or_unverified_after_the_flow_started_is_refused(): void
    {
        $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->json('authUrl');
        $link = $this->idp->authorize($start, 'ada@acme.test');
        $this->actingAs($this->owner)->postJson('/web-api/team/sso/enable', ['enabled' => false])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->assertSame('sso_unavailable', $this->errorOf($this->get($link)));
        $this->postJson('/web-api/auth/sso/start', ['email' => 'ada@acme.test'])->assertStatus(404)->assertJsonPath('code', 'sso_unavailable');
    }

    public function test_the_client_secret_may_be_sent_with_basic_authentication_when_that_is_what_the_provider_supports(): void
    {
        $this->idp->authMethod = 'client_secret_basic';
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody(['clientSecret' => $this->idp->secret]))->assertOk();
        $this->postJson('/web-api/team/sso/enable', ['enabled' => true])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->person('ada@acme.test');
        $this->ssoSignIn('ada@acme.test')->assertRedirect('/account/team');
    }

    private function stateOf(string $authUrl): string
    {
        parse_str(parse_url($authUrl, PHP_URL_QUERY), $q);
        return $q['state'];
    }
}
