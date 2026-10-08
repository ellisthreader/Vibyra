<?php

namespace Tests\Feature\Teams;

use App\Models\{Organization, OrganizationMember};
use App\Services\Teams\Roles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/** Roadmap Part 13: organizations, the role permission matrix, last-owner protection, and the activity trail. */
class TeamsOrganizationsTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootTeams();
    }

    public function test_everything_is_404_while_teams_is_off(): void
    {
        config(['teams.enabled' => false]);
        $this->actingAs($this->person());
        $this->getJson('/web-api/team')->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->postJson('/web-api/team', ['name' => 'Acme'])->assertNotFound();
        $this->postJson('/web-api/auth/sso/start', ['email' => 'a@acme.test'])->assertNotFound();
        $this->getJson('/auth/sso/callback?state=x')->assertNotFound();
        $this->assertSame(0, Organization::count());
    }

    public function test_a_person_creates_a_team_becomes_its_owner_and_can_rename_it(): void
    {
        $ada = $this->person();
        $this->actingAs($ada)->getJson('/web-api/team')->assertOk()->assertJsonPath('team', null)->assertJsonPath('canCreate', true);
        $this->postJson('/web-api/team', ['name' => '  Acme Ltd  '])->assertCreated()->assertJsonPath('team.name', 'Acme Ltd')
            ->assertJsonPath('role', 'owner')->assertJsonPath('members.0.email', $ada->email);
        $this->patchJson('/web-api/team', ['name' => 'Acme Labs'])->assertOk()->assertJsonPath('team.name', 'Acme Labs');
        $this->assertSame(['team.created', 'team.renamed'], array_column($this->events($ada), 'event'));
    }

    public function test_a_second_team_is_refused_and_names_are_validated(): void
    {
        $ada = $this->person();
        $this->actingAs($ada)->postJson('/web-api/team', ['name' => ''])->assertStatus(422);
        $this->postJson('/web-api/team', ['name' => str_repeat('a', 300)])->assertStatus(422);
        $this->postJson('/web-api/team', ['name' => str_repeat('a', 81)])->assertStatus(422)->assertJsonPath('code', 'invalid_name');
        $this->postJson('/web-api/team', ['name' => 'One'])->assertCreated();
        $this->postJson('/web-api/team', ['name' => 'Two'])->assertStatus(409)->assertJsonPath('code', 'already_in_team');
        $this->assertSame(1, Organization::count());
    }

    public function test_the_plan_gate_only_applies_to_creating_and_only_when_on(): void
    {
        config(['teams.plan_gate' => true]);
        $ada = $this->person();
        $this->actingAs($ada)->postJson('/web-api/team', ['name' => 'Acme'])->assertStatus(402)->assertJsonPath('code', 'plan_required');
        $this->getJson('/web-api/team')->assertJsonPath('canCreate', false);
        config(['teams.plans' => ['free']]);
        $this->postJson('/web-api/team', ['name' => 'Acme'])->assertCreated();
        // Joining is never gated.
        [$org] = $this->team($this->person(), 'Other');
        $bob = $this->person();
        $this->seat($org, $bob);
        $this->assertNotNull($this->memberOf($bob));
    }

    public function test_guests_and_signed_out_callers_never_reach_it(): void
    {
        $this->getJson('/web-api/team')->assertUnauthorized();
        $guest = $this->person(null, ['guest_at' => now()]);
        $this->actingAs($guest)->getJson('/web-api/team')->assertUnauthorized();
    }

    public function test_the_last_owner_cannot_leave_but_a_second_owner_can_after_a_handover(): void
    {
        [$org, $owner] = $this->team();
        $other = $this->person();
        $seat = $this->seat($org, $other, 'admin');
        $this->actingAs($owner)->postJson('/web-api/team/leave')->assertStatus(409)->assertJsonPath('code', 'last_owner');
        $this->assertNotNull($this->memberOf($owner));
        $this->postJson('/web-api/team/transfer', ['memberId' => $seat->id])->assertOk();
        $this->assertSame('owner', $this->memberOf($other)->role);
        $this->assertSame('admin', $this->memberOf($owner)->role);
        $this->postJson('/web-api/team/leave')->assertOk();
        $this->assertNull($this->memberOf($owner));
        // The remaining owner is now the last one.
        $this->actingAs($other)->postJson('/web-api/team/leave')->assertStatus(409)->assertJsonPath('code', 'last_owner');
        // Two owners: either may leave, once.
        $third = $this->person();
        $this->seat($org, $third, 'member');
        $this->patchJson('/web-api/team/members/'.$this->memberOf($third)->id, ['role' => 'owner'])->assertOk();
        $this->postJson('/web-api/team/leave')->assertOk();
        $this->actingAs($third)->postJson('/web-api/team/leave')->assertStatus(409);
    }

    public function test_a_member_can_leave_and_leaving_twice_is_not_an_error(): void
    {
        [$org] = $this->team();
        $bob = $this->person();
        $this->seat($org, $bob);
        $this->actingAs($bob)->postJson('/web-api/team/leave')->assertOk();
        $this->postJson('/web-api/team/leave')->assertNotFound()->assertJsonPath('code', 'no_team');
        $this->assertNull($this->memberOf($bob));
    }

    public function test_a_member_sees_names_and_roles_but_not_other_peoples_emails(): void
    {
        [$org, $owner] = $this->team();
        [$bob, $cat] = [$this->person('bob@acme.test'), $this->person('cat@acme.test')];
        $this->seat($org, $bob);
        $this->seat($org, $cat);
        $rows = collect($this->actingAs($bob)->getJson('/web-api/team')->json('members'))->keyBy('role');
        $this->assertNull($rows['owner']['email']);
        $this->assertSame('bob@acme.test', collect($this->getJson('/web-api/team')->json('members'))->firstWhere('you', true)['email']);
        $this->assertContains($owner->email, collect($this->actingAs($owner)->getJson('/web-api/team')->json('members'))->pluck('email')->all());
    }

    public function test_request_bodies_cannot_set_columns_they_should_not(): void
    {
        $ada = $this->person();
        $this->actingAs($ada)->postJson('/web-api/team', ['name' => 'Acme', 'seats' => 9999, 'id' => 'forced', 'stripe_subscription_id' => 'sub_x',
            'member_month_cap_units' => 1, 'role' => 'member'])->assertCreated();
        $org = Organization::first();
        $this->assertNull($org->seats);
        $this->assertNull($org->stripe_subscription_id);
        $this->assertNull($org->member_month_cap_units);
        $this->assertNotSame('forced', $org->id);
        $this->assertSame('owner', $this->memberOf($ada)->role);
        $this->assertThrows(fn () => Organization::query()->create(['name' => 'x']), \Illuminate\Database\Eloquent\MassAssignmentException::class);
        $this->assertThrows(fn () => OrganizationMember::query()->create(['role' => 'owner']), \Illuminate\Database\Eloquent\MassAssignmentException::class);
    }
}
