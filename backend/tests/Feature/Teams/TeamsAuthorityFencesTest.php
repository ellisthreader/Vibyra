<?php

namespace Tests\Feature\Teams;

use App\Services\Teams\{MemberCaps, Organizations, Teams};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Tests\Support\TeamsFixture;
use Tests\TestCase;

class TeamsAuthorityFencesTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    public function test_invitation_shell_loads_before_sign_in_but_team_data_remains_private(): void
    {
        $this->bootTeams();
        $this->get('/team/join')->assertOk();
        $this->get('/account/team')->assertOk();
        $this->getJson('/web-api/team')->assertUnauthorized();
        $this->postJson('/web-api/team/invitations/preview', ['token' => 'invalid'])->assertUnauthorized();
    }

    public function test_a_replaced_seat_does_not_reauthorize_an_old_manager_request(): void
    {
        $this->bootTeams();
        [$org, $owner] = $this->team();
        $manager = $this->person();
        $stale = $this->seat($org, $manager, 'admin');
        app(Organizations::class)->remove($owner, $stale->id);
        $this->seat($org, $manager, 'admin');
        try {
            DB::transaction(function () use ($org, $stale) {
                Teams::lock($org->id);
                Teams::current($stale, 'invite');
            });
            $this->fail('An old seat must not authorize a new membership.');
        } catch (HttpResponseException $error) {
            $this->assertSame(403, $error->getResponse()->getStatusCode());
        }
    }

    public function test_monthly_token_caps_are_not_advertised_without_the_separate_enforcement_gate(): void
    {
        $this->bootTeams();
        [$org, $owner] = $this->team();
        $org->forceFill(['member_month_cap_units' => 10000])->save();
        config(['teams.member_caps_enabled' => false]);
        $overview = $this->actingAs($owner)->getJson('/web-api/team')->assertOk();
        $this->assertNotContains('set_cap', $overview->json('can'));
        $this->putJson('/web-api/team/cap', ['tokens' => 10])->assertStatus(409)->assertJsonPath('code', 'caps_unavailable');
        $this->assertNull(app(MemberCaps::class)->ceiling($owner->id));
        $new = $this->person();
        app(MemberCaps::class)->seed($this->seat($org, $new), $org);
        $this->assertFalse(DB::table('vibes_wallets')->where('user_id', $new->id)->exists());
    }
}
