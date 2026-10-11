<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationMember, OrganizationSso, VibyraSession};
use App\Services\Teams\{Offboarding, Organizations};
use App\Services\Teams\Sso\{Domains, SignIn, SsoException};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Notification;
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

class TeamsLifecycleFencesTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->configureSso();
    }

    private function signedOut(): void
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
    }

    public function test_removal_blocks_jit_rejoin_until_a_fresh_invitation_is_accepted(): void
    {
        Notification::fake();
        $ada = $this->person('ada@acme.test');
        $this->ssoSignIn($ada->email)->assertRedirect('/account/team');
        $oldSeat = $this->memberOf($ada)->id;
        app(Organizations::class)->remove($this->owner, $oldSeat);
        $this->assertTrue(Offboarding::blocked($this->org->id, $ada->id));
        $this->signedOut();
        $this->assertSame('membership_removed', $this->errorOf($this->ssoSignIn($ada->email)));
        $this->assertGuest();
        $this->assertNull($this->memberOf($ada));
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => $ada->email])->assertCreated();
        $this->actingAs($ada)->postJson('/web-api/team/invitations/accept', ['token' => $this->inviteToken($ada->email)])->assertOk();
        $this->assertFalse(Offboarding::blocked($this->org->id, $ada->id));
        $this->assertNotSame($oldSeat, $this->memberOf($ada)->id);
        $this->signedOut();
        $this->ssoSignIn($ada->email)->assertRedirect('/account/team');
    }

    public function test_leaving_also_prevents_silent_sso_rejoining(): void
    {
        $ada = $this->person('ada@acme.test');
        $this->ssoSignIn($ada->email)->assertRedirect('/account/team');
        app(Organizations::class)->leave($ada);
        $this->signedOut();
        $this->assertSame('membership_removed', $this->errorOf($this->ssoSignIn($ada->email)));
        $this->assertNull($this->memberOf($ada));
    }

    public function test_an_invitation_issued_before_sso_join_cannot_undo_later_removal(): void
    {
        Notification::fake();
        $ada = $this->person('ada@acme.test');
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => $ada->email])->assertCreated();
        $oldToken = $this->inviteToken($ada->email);
        $this->signedOut();
        $this->ssoSignIn($ada->email)->assertRedirect('/account/team');
        app(Organizations::class)->remove($this->owner, $this->memberOf($ada)->id);
        $this->actingAs($ada)->postJson('/web-api/team/invitations/accept', ['token' => $oldToken])
            ->assertStatus(410)->assertJsonPath('code', 'invite_revoked');
        $this->assertNull($this->memberOf($ada));
        $this->assertTrue(Offboarding::blocked($this->org->id, $ada->id));
    }

    public function test_enrolling_a_second_factor_after_binding_does_not_allow_sso_to_bypass_it(): void
    {
        $ada = $this->person('ada@acme.test');
        $this->ssoSignIn($ada->email)->assertRedirect('/account/team');
        $this->signedOut();
        $this->mock(\App\Services\Auth\TwoFactor::class, fn ($mock) => $mock->shouldReceive('enabled')->andReturn(true));
        $this->assertSame('two_factor', $this->errorOf($this->ssoSignIn($ada->email)));
        $this->assertGuest();
        $this->assertSame(0, VibyraSession::count());
    }

    public function test_a_flow_cannot_survive_a_client_configuration_change(): void
    {
        $ada = $this->person('ada@acme.test');
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => $ada->email])->assertOk()->json('authUrl');
        $callback = $this->idp->authorize($start, $ada->email);
        OrganizationSso::query()->findOrFail($this->org->id)->forceFill(['client_id' => 'replacement-client'])->save();
        $this->assertSame('sso_unavailable', $this->errorOf($this->get($callback)));
        $this->assertGuest();
        $this->assertNull($this->memberOf($ada));
        $this->assertSame(0, $this->idp->log['/token'] ?? 0);
    }

    public function test_configuration_is_rechecked_after_the_provider_exchange(): void
    {
        $ada = $this->person('ada@acme.test');
        $stale = OrganizationSso::query()->findOrFail($this->org->id);
        $stale->fresh()->forceFill(['enabled' => false])->save();
        try {
            app(SignIn::class)->resolve($stale, ['subject' => 'subject', 'email' => $ada->email, 'name' => 'Ada']);
            $this->fail('A disabled configuration cannot complete a delayed exchange.');
        } catch (SsoException $error) {
            $this->assertSame('sso_unavailable', $error->reason);
        }
        $this->assertNull($this->memberOf($ada));
    }

    public function test_delayed_dns_does_not_verify_replaced_configuration_or_a_revoked_owner(): void
    {
        $cfg = OrganizationSso::query()->findOrFail($this->org->id);
        $value = Domains::recordValue($cfg);
        $resolver = new Domains(function () use ($cfg, $value) {
            $cfg->fresh()->forceFill(['client_id' => 'changed'])->save();
            return [$value];
        });
        try {
            $resolver->checkDns($cfg, $this->org, $this->owner);
            $this->fail('Stale DNS result must be refused.');
        } catch (HttpResponseException $error) {
            $this->assertSame(409, $error->getResponse()->getStatusCode());
        }
        $cfg = $cfg->fresh();
        $resolver = new Domains(function () use ($value) {
            OrganizationMember::query()->where('user_id', $this->owner->id)->update(['role' => 'member']);
            return [$value];
        });
        try {
            $resolver->checkDns($cfg, $this->org, $this->owner);
            $this->fail('A former owner cannot verify a domain.');
        } catch (HttpResponseException $error) {
            $this->assertSame(403, $error->getResponse()->getStatusCode());
        }
    }
}
