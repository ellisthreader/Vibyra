<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationInvitation, OrganizationMember};
use App\Notifications\TeamInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Notification};
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/** Roadmap Part 13: invitation scope, seats and mail failure. */
class TeamsInvitationRulesTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootTeams();
        Notification::fake();
    }

    private function invite(string $email = 'new@acme.test', string $role = 'member'): string
    {
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => $email, 'role' => $role])->assertCreated();
        return $this->inviteToken(strtolower(trim($email)));
    }

    private $org;
    private $owner;

    private function boot2(): void
    {
        [$this->org, $this->owner] = $this->team();
    }

    public function test_invitations_are_scoped_to_the_callers_team(): void
    {
        $this->boot2();
        $this->invite('bob@acme.test');
        $id = OrganizationInvitation::sole()->id;
        [, $otherOwner] = $this->team(null, 'Other');
        $this->actingAs($otherOwner)->deleteJson('/web-api/team/invitations/'.$id)->assertNotFound()->assertJsonPath('code', 'invite_not_found');
        $this->assertNull(OrganizationInvitation::sole()->revoked_at);
        $this->assertSame([], $this->getJson('/web-api/team')->json('invitations'));
    }

    public function test_someone_already_in_a_team_cannot_accept_and_members_cannot_be_invited(): void
    {
        $this->boot2();
        $token = $this->invite('bob@acme.test');
        $bob = $this->person('bob@acme.test');
        [$other] = $this->team(null, 'Other');
        $this->seat($other, $bob);
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertStatus(409)->assertJsonPath('code', 'already_in_team');
        $this->assertNull(OrganizationInvitation::sole()->accepted_at, 'a refused accept does not burn the link');
        $carl = $this->person('carl@acme.test');
        $this->seat($this->org, $carl);
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => 'carl@acme.test'])->assertStatus(409)->assertJsonPath('code', 'already_member');
        $this->postJson('/web-api/team/invitations', ['email' => 'not-an-email'])->assertStatus(422);
    }

    public function test_seats_hold_for_members_and_open_invitations_and_the_cap_on_open_invitations_applies(): void
    {
        $this->boot2();
        $this->org->forceFill(['seats' => 3])->save();
        $this->seat($this->org, $this->person());
        $token = $this->invite('a@acme.test');
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => 'b@acme.test'])->assertStatus(409)->assertJsonPath('code', 'no_seats');
        $this->getJson('/web-api/team')->assertJsonPath('team.seats', 3)->assertJsonPath('team.seatsUsed', 2)->assertJsonPath('team.seatsHeld', 1);
        $this->actingAs($this->person('a@acme.test'))->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertOk();
        // Seats shrink under the members (a lapsed plan): the people stay, the door closes.
        $this->org->forceFill(['seats' => 0])->save();
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => 'c@acme.test'])->assertStatus(409);
        config(['teams.max_pending_invites' => 1, 'teams.max_members' => 50]);
        $this->org->forceFill(['seats' => null])->save();
        $this->invite('d@acme.test');
        $this->postJson('/web-api/team/invitations', ['email' => 'e@acme.test'])->assertStatus(409)->assertJsonPath('code', 'too_many_invites');
    }

    public function test_a_failing_mail_transport_does_not_lose_the_invitation(): void
    {
        $this->boot2();
        Notification::swap(new class {
            public function route(...$a) { throw new \RuntimeException('smtp down'); }
        });
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => 'bob@acme.test'])->assertCreated();
        $this->assertSame(1, OrganizationInvitation::count());
    }
}
