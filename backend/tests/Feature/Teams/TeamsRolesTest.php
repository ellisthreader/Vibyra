<?php

namespace Tests\Feature\Teams;

use App\Models\{Organization, OrganizationMember};
use App\Services\Teams\Roles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/** Roadmap Part 13: the role permission matrix over HTTP, the activity trail and cross-team isolation. */
class TeamsRolesTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootTeams();
    }

    public function test_the_role_permission_matrix(): void
    {
        $expect = [
            'owner' => ['view', 'leave', 'rename', 'invite', 'invite_admin', 'revoke_invite', 'remove', 'set_cap', 'change_role', 'transfer', 'sso'],
            'admin' => ['view', 'leave', 'rename', 'invite', 'revoke_invite', 'remove', 'set_cap'],
            'member' => ['view', 'leave'],
        ];
        foreach ($expect as $role => $allowed) $this->assertEqualsCanonicalizing($allowed, Roles::allowed($role), $role);
        $this->assertFalse(Roles::can(null, 'view'));
        $this->assertFalse(Roles::can('member', 'nonsense'));
        $this->assertTrue(Roles::outranks('owner', 'admin'));
        $this->assertTrue(Roles::outranks('admin', 'member'));
        $this->assertFalse(Roles::outranks('admin', 'admin'));
        $this->assertFalse(Roles::outranks('member', 'member'));
        $this->assertFalse(Roles::outranks('admin', 'owner'));
    }

    public function test_the_matrix_over_http(): void
    {
        [$org, $owner] = $this->team();
        [$admin, $member, $peer] = [$this->person(), $this->person(), $this->person()];
        $this->seat($org, $admin, 'admin');
        $this->seat($org, $member);
        $peerSeat = $this->seat($org, $peer, 'admin');
        $ownerSeat = $this->memberOf($owner);
        $memberSeat = $this->memberOf($member);

        // A member can see the team but not run it.
        $this->actingAs($member)->getJson('/web-api/team')->assertOk()->assertJsonPath('role', 'member')->assertJsonPath('invitations', []);
        $this->patchJson('/web-api/team', ['name' => 'X'])->assertForbidden();
        $this->postJson('/web-api/team/invitations', ['email' => 'x@y.test'])->assertForbidden();
        $this->deleteJson('/web-api/team/members/'.$ownerSeat->id)->assertForbidden();
        $this->patchJson('/web-api/team/members/'.$memberSeat->id, ['role' => 'admin'])->assertForbidden();
        $this->putJson('/web-api/team/cap', ['tokens' => 10])->assertForbidden();
        $this->putJson('/web-api/team/sso', ['issuer' => 'https://i.test', 'clientId' => 'c', 'domain' => 'acme.test'])->assertForbidden();
        $this->postJson('/web-api/team/transfer', ['memberId' => $memberSeat->id])->assertForbidden();

        // An admin runs people but cannot touch owners, peers, roles, SSO or ownership.
        $this->actingAs($admin);
        $this->patchJson('/web-api/team', ['name' => 'Renamed'])->assertOk();
        $this->deleteJson('/web-api/team/members/'.$ownerSeat->id)->assertForbidden();
        $this->deleteJson('/web-api/team/members/'.$peerSeat->id)->assertForbidden();
        $this->patchJson('/web-api/team/members/'.$memberSeat->id, ['role' => 'admin'])->assertForbidden();
        $this->putJson('/web-api/team/sso', ['issuer' => 'https://i.test', 'clientId' => 'c', 'domain' => 'acme.test'])->assertForbidden();
        $this->postJson('/web-api/team/transfer', ['memberId' => $memberSeat->id])->assertForbidden();
        $this->postJson('/web-api/team/invitations', ['email' => 'new@acme.test', 'role' => 'admin'])->assertForbidden();
        $this->postJson('/web-api/team/invitations', ['email' => 'new@acme.test'])->assertCreated();
        $this->deleteJson('/web-api/team/members/'.$memberSeat->id)->assertOk();
        $this->assertNull($this->memberOf($member));

        // An owner may do all of it, except act on their own seat.
        $this->actingAs($owner);
        $this->patchJson('/web-api/team/members/'.$peerSeat->id, ['role' => 'member'])->assertOk();
        $this->assertSame('member', $this->memberOf($peer)->role);
        $this->patchJson('/web-api/team/members/'.$ownerSeat->id, ['role' => 'member'])->assertStatus(422)->assertJsonPath('code', 'not_yourself');
        $this->deleteJson('/web-api/team/members/'.$ownerSeat->id)->assertStatus(422)->assertJsonPath('code', 'use_leave');
        $this->patchJson('/web-api/team/members/'.$peerSeat->id, ['role' => 'god'])->assertStatus(422);
    }

    public function test_every_change_is_logged_for_the_actor_and_the_affected_member(): void
    {
        [$org, $owner] = $this->team(null, 'Acme');
        [$bob, $eve] = [$this->person(), $this->person()];
        $bobSeat = $this->seat($org, $bob);
        $this->seat($org, $eve, 'admin');
        $this->actingAs($owner);
        $this->patchJson('/web-api/team/members/'.$bobSeat->id, ['role' => 'admin'])->assertOk();
        $this->deleteJson('/web-api/team/members/'.$bobSeat->id)->assertOk();
        $this->postJson('/web-api/team/transfer', ['memberId' => $this->memberOf($eve)->id])->assertOk();
        $this->postJson('/web-api/team/leave')->assertOk(); // handed over, so no longer the last owner

        $ownerLog = $this->events($owner);
        $this->assertSame(['team.role_changed', 'team.member_removed', 'team.ownership_transferred', 'team.member_left'], array_column($ownerLog, 'event'));
        $this->assertSame('account', $ownerLog[0]['actor']);
        $this->assertSame(['org' => 'Acme', 'from' => 'member', 'to' => 'admin'], $ownerLog[0]['detail']);
        $bobLog = $this->events($bob);
        $this->assertSame(['team.role_changed', 'team.member_removed'], array_column($bobLog, 'event'));
        $this->assertSame('system', $bobLog[0]['actor']);
        $this->assertSame($owner->id, $bobLog[0]['detail']['by']);
        $this->assertSame(['team.ownership_transferred'], array_column($this->events($eve), 'event'));
    }

    public function test_one_team_can_never_reach_another_by_id(): void
    {
        [$orgA, $ownerA] = $this->team(null, 'A');
        [$orgB, $ownerB] = $this->team(null, 'B');
        $victim = $this->person();
        $victimSeat = $this->seat($orgB, $victim);
        $this->actingAs($ownerA);
        $this->deleteJson('/web-api/team/members/'.$victimSeat->id)->assertNotFound()->assertJsonPath('code', 'member_not_found');
        $this->patchJson('/web-api/team/members/'.$victimSeat->id, ['role' => 'admin'])->assertNotFound();
        $this->putJson('/web-api/team/members/'.$victimSeat->id.'/cap', ['tokens' => 5])->assertNotFound();
        $this->postJson('/web-api/team/transfer', ['memberId' => $victimSeat->id])->assertNotFound();
        $this->assertSame('member', $this->memberOf($victim)->role);
        $this->assertSame($orgB->id, $this->memberOf($victim)->organization_id);
        $this->assertSame('B', $this->actingAs($ownerB)->getJson('/web-api/team')->json('team.name'));
    }
}
