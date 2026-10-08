<?php

namespace Tests\Feature\Teams;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

/** Roadmap Part 13: "require SSO for its domain" (password sign-in refused, SSO and owners exempt) and the app/desktop SSO flow. */
class TeamsSsoPolicyTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    private function password(string $email): User
    {
        return $this->person($email, ['password' => 'correct-horse-battery']);
    }

    public function test_when_required_password_sign_in_is_refused_on_the_web_and_in_the_app_for_that_domain_only(): void
    {
        $this->configureSso(true, true);
        $this->password('ada@acme.test');
        $this->password('eve@elsewhere.test');
        $body = fn (string $e) => ['email' => $e, 'password' => 'correct-horse-battery'];
        $this->postJson('/web-api/auth/login', $body('ada@acme.test'))->assertForbidden()->assertJsonPath('code', 'sso_required');
        $this->assertGuest();
        $this->postJson('/api/auth/login', $body('ada@acme.test'))->assertForbidden()->assertJsonPath('code', 'sso_required');
        $this->assertSame(0, VibyraSession::count(), 'no app session was minted');
        $this->postJson('/web-api/auth/login', $body('eve@elsewhere.test'))->assertOk();
        $this->postJson('/api/auth/login', $body('eve@elsewhere.test'))->assertOk()->assertJsonStructure(['token']);
    }

    public function test_without_the_requirement_or_with_teams_off_passwords_still_work(): void
    {
        $this->configureSso(true, false);
        $this->password('ada@acme.test');
        $this->postJson('/web-api/auth/login', ['email' => 'ada@acme.test', 'password' => 'correct-horse-battery'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->actingAs($this->owner)->postJson('/web-api/team/sso/enable', ['enabled' => true, 'requireSso' => true])->assertOk();
        $this->app['auth']->forgetGuards();
        config(['teams.enabled' => false]);
        $this->postJson('/api/auth/login', ['email' => 'ada@acme.test', 'password' => 'correct-horse-battery'])->assertOk();
    }

    public function test_owners_keep_their_password_so_a_broken_provider_cannot_lock_the_team_out(): void
    {
        $this->owner->forceFill(['password' => 'correct-horse-battery'])->save();
        $this->configureSso(true, true);
        $this->postJson('/web-api/auth/login', ['email' => 'owner@acme.test', 'password' => 'correct-horse-battery'])->assertOk();
        // An admin is not exempt.
        $admin = $this->password('admin@acme.test');
        $this->seat($this->org, $admin, 'admin');
        $this->postJson('/api/auth/login', ['email' => 'admin@acme.test', 'password' => 'correct-horse-battery'])->assertForbidden();
    }

    public function test_sso_itself_still_signs_in_when_required(): void
    {
        $this->configureSso(true, true);
        $ada = $this->password('ada@acme.test');
        $this->ssoSignIn('ada@acme.test')->assertRedirect('/account/team');
        $this->assertAuthenticatedAs($ada);
    }

    public function test_the_login_page_can_ask_whether_sso_is_offered_at_all(): void
    {
        $this->getJson('/web-api/auth/sso')->assertOk()->assertJsonPath('enabled', true);
        config(['teams.enabled' => false]);
        $this->getJson('/web-api/auth/sso')->assertOk()->assertJsonPath('enabled', false);
    }

    private function appFlow(string $email, string $secret): array
    {
        $start = $this->postJson('/api/auth/sso/start', ['email' => $email, 'flowSecret' => $secret, 'deviceName' => 'Ada Mac', 'installId' => 'inst-1'])->assertOk();
        return [$start->json('flowId'), $start->json('authUrl')];
    }

    public function test_an_app_signs_in_through_the_browser_and_collects_the_session_once_with_its_secret(): void
    {
        $this->configureSso(true, true);
        $ada = $this->password('ada@acme.test');
        $secret = str_repeat('s', 40);
        [$flowId, $authUrl] = $this->appFlow('ada@acme.test', $secret);
        $this->getJson('/api/auth/sso/status/'.$flowId, ['X-Vibyra-Flow-Secret' => $secret])->assertOk()->assertJsonPath('status', 'pending');
        $this->get($this->idp->authorize($authUrl, 'ada@acme.test'))->assertOk()->assertSee('Return to the Vibyra app');
        $this->assertGuest();
        $this->getJson('/api/auth/sso/status/'.$flowId, ['X-Vibyra-Flow-Secret' => 'wrong-secret'.str_repeat('x', 30)])->assertForbidden();
        $done = $this->getJson('/api/auth/sso/status/'.$flowId, ['X-Vibyra-Flow-Secret' => $secret])->assertOk()->assertJsonPath('user.email', 'ada@acme.test');
        $token = $done->json('token');
        $this->assertNotEmpty($token);
        $this->assertSame('Ada Mac', VibyraSession::first()->device_name);
        $this->assertSame($this->org->id, $this->memberOf($ada)->organization_id);
        $this->getJson('/api/auth/sso/status/'.$flowId, ['X-Vibyra-Flow-Secret' => $secret])->assertStatus(410);
        $this->withToken($token)->getJson('/api/account/sessions')->assertOk();
    }

    public function test_an_app_flow_needs_a_long_secret_and_reports_a_failed_sign_in_by_code(): void
    {
        $this->configureSso();
        $this->postJson('/api/auth/sso/start', ['email' => 'ada@acme.test', 'flowSecret' => 'short'])->assertStatus(422);
        $this->postJson('/api/auth/sso/start', ['email' => 'ada@acme.test'])->assertStatus(422);
        $secret = str_repeat('k', 40);
        [$flowId, $authUrl] = $this->appFlow('nobody@acme.test', $secret);
        $this->get($this->idp->authorize($authUrl, 'nobody@acme.test'))->assertStatus(400);
        $this->getJson('/api/auth/sso/status/'.$flowId, ['X-Vibyra-Flow-Secret' => $secret])->assertOk()
            ->assertJsonPath('status', 'failed')->assertJsonPath('code', 'account_required')->assertJsonMissingPath('token');
        $this->getJson('/api/auth/sso/status/'.str_repeat('z', 64), ['X-Vibyra-Flow-Secret' => $secret])->assertStatus(410);
        $this->assertContains($this->getJson('/api/auth/sso/status/short')->status(), [404, 405]);
    }
}
