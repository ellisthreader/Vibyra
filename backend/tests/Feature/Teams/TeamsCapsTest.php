<?php

namespace Tests\Feature\Teams;

use App\Models\{User, VibyraSession};
use App\Services\Spend\Settings;
use App\Services\Teams\MemberCaps;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/**
 * Roadmap Part 13: a team's default monthly spend cap per member seeds the member's own Part 5 cap. The member may lower it; only an
 * admin may raise it (by setting that member's ceiling). There is no shared wallet: every cap lives on the member's own wallet.
 */
class TeamsCapsTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    private $org;
    private $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootTeams();
        [$this->org, $this->owner] = $this->team();
    }

    private function cap(User $u): ?float
    {
        $units = DB::table('vibes_wallets')->where('user_id', $u->id)->value('cap_month_units');
        return $units === null ? null : $units / 10000;
    }

    /** The member's own call, through the real Part 5 route with their bearer token. */
    private function own(User $u, string $verb, string $path, array $body = [])
    {
        app(\App\Services\Vibes\Wallet::class)->ensure($u, 0);
        VibyraSession::query()->firstOrCreate(['token_hash' => hash('sha256', 'tok-'.$u->id)], ['user_id' => $u->id, 'last_used_at' => now()]);
        return $this->withToken('tok-'.$u->id)->{$verb.'Json'}($path, $body);
    }

    private function join(string $role = 'member'): User
    {
        $u = $this->person();
        $this->seat($this->org, $u, $role);
        return $u;
    }

    public function test_setting_the_default_seeds_existing_members_and_never_raises_a_lower_cap(): void
    {
        [$low, $none, $high] = [$this->join(), $this->join(), $this->join()];
        $this->own($low, 'put', '/api/vibes/spend-caps', ['month' => 20])->assertOk();
        $this->own($high, 'put', '/api/vibes/spend-caps', ['month' => 500])->assertOk();
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 100])->assertOk()->assertJsonPath('team.defaultMonthCapTokens', 100);
        $this->assertSame(20.0, $this->cap($low), 'a lower cap is left alone');
        $this->assertSame(100.0, $this->cap($none), 'no cap becomes the default');
        $this->assertSame(100.0, $this->cap($high), 'a higher cap is brought down');
        $this->assertSame(['team.cap_changed'], array_column($this->events($this->owner), 'event'));
    }

    public function test_a_new_member_starts_on_the_default_and_leaving_keeps_the_cap_but_ends_the_ceiling(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 100])->assertOk();
        $this->postJson('/web-api/team/invitations', ['email' => 'new@acme.test'])->assertCreated();
        $bob = $this->person('new@acme.test');
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $this->inviteToken('new@acme.test')])->assertOk()
            ->assertJsonPath('you.monthCapCeilingTokens', 100);
        $this->assertSame(100.0, $this->cap($bob));
        $this->actingAs($bob)->postJson('/web-api/team/leave')->assertOk();
        $this->assertSame(100.0, $this->cap($bob), 'the wallet is theirs; its cap stays');
        $this->assertNull(app(MemberCaps::class)->ceiling($bob->id));
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['month' => 400])->assertOk()->assertJsonPath('spendCaps.month.limit', 400);
    }

    public function test_a_member_can_lower_but_not_raise_or_switch_off_their_cap(): void
    {
        $bob = $this->join();
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 100])->assertOk();
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['month' => 40])->assertOk()->assertJsonPath('spendCaps.month.limit', 40);
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['month' => 100])->assertOk(); // up to the ceiling is fine
        foreach ([['month' => 101], ['month' => null]] as $body) {
            $this->own($bob, 'put', '/api/vibes/spend-caps', $body)->assertForbidden()->assertJsonPath('code', 'team_cap')->assertJsonPath('limit', 100);
        }
        $this->assertSame(100.0, $this->cap($bob));
        // The daily and per-task caps are theirs entirely.
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['day' => 500, 'run' => 50])->assertOk();
        // "Raise for this month" would pass the ceiling too; "raise for today" does not.
        $this->own($bob, 'post', '/api/vibes/spend-caps/raise', ['cap' => 'month'])->assertForbidden()->assertJsonPath('code', 'team_cap');
        $this->own($bob, 'post', '/api/vibes/spend-caps/raise', ['cap' => 'day'])->assertOk();
    }

    public function test_only_an_admin_can_raise_one_persons_ceiling_above_the_default(): void
    {
        $bob = $this->join();
        $admin = $this->join('admin');
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 100])->assertOk();
        $seat = $this->memberOf($bob);
        $this->actingAs($bob)->putJson('/web-api/team/members/'.$seat->id.'/cap', ['tokens' => 300])->assertForbidden();
        $this->actingAs($admin)->putJson('/web-api/team/members/'.$seat->id.'/cap', ['tokens' => 300])->assertOk()
            ->assertJsonPath('members.2.monthCapTokens', 300);
        $this->assertSame(300.0, $this->cap($bob), 'the admin\'s choice becomes their cap');
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['month' => 250])->assertOk();
        $this->own($bob, 'put', '/api/vibes/spend-caps', ['month' => 301])->assertForbidden();
        // A later change of the team default does not touch someone with their own ceiling.
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 50])->assertOk();
        $this->assertSame(250.0, $this->cap($bob));
        // Back to the default.
        $this->actingAs($admin)->putJson('/web-api/team/members/'.$seat->id.'/cap', ['tokens' => null])->assertOk();
        $this->assertSame(50.0, $this->cap($bob));
        $this->assertCount(2, $this->events($bob, 'team.cap_changed'));
    }

    public function test_an_admin_cannot_set_the_limit_of_a_peer_or_an_owner(): void
    {
        $adminA = $this->join('admin');
        $adminB = $this->join('admin');
        $this->actingAs($adminA)->putJson('/web-api/team/members/'.$this->memberOf($adminB)->id.'/cap', ['tokens' => 5])->assertForbidden();
        $this->putJson('/web-api/team/members/'.$this->memberOf($this->owner)->id.'/cap', ['tokens' => 5])->assertForbidden();
        $this->putJson('/web-api/team/members/'.$this->memberOf($adminA)->id.'/cap', ['tokens' => 5])->assertOk(); // their own is fine
    }

    public function test_caps_are_validated_and_the_flag_off_is_a_no_op_for_the_ceiling(): void
    {
        $this->actingAs($this->owner);
        foreach ([0, 0.5, 1000000, 'abc'] as $bad) $this->putJson('/web-api/team/cap', ['tokens' => $bad])->assertStatus(422);
        $this->putJson('/web-api/team/cap', [])->assertStatus(422);
        $this->putJson('/web-api/team/cap', ['tokens' => 100])->assertOk();
        $bob = $this->join();
        config(['teams.enabled' => false]);
        $this->assertNull(app(MemberCaps::class)->ceiling($bob->id));
        app(\App\Services\Vibes\Wallet::class)->ensure($bob, 0);
        app(Settings::class)->save($bob->id, ['month' => 9999]);
        $this->assertSame(9999.0, $this->cap($bob));
    }

    public function test_the_ceiling_check_is_enforced_inside_the_spend_settings_service_too(): void
    {
        $bob = $this->join();
        $this->actingAs($this->owner)->putJson('/web-api/team/cap', ['tokens' => 10])->assertOk();
        try {
            app(Settings::class)->save($bob->id, ['month' => 11]);
            $this->fail('expected a refusal');
        } catch (HttpResponseException $e) {
            $this->assertSame(403, $e->getResponse()->getStatusCode());
            $this->assertSame('team_cap', $e->getResponse()->getData()->code);
        }
        $this->assertSame(10.0, $this->cap($bob));
    }
}
