<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationInvitation, OrganizationMember};
use App\Notifications\TeamInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Notification};
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/** Roadmap Part 13: invitations by email link (hashed single-use tokens, expiry, revoke, who may accept) and seats. */
class TeamsInvitationsTest extends TestCase
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

    public function test_an_invitation_is_emailed_as_a_fragment_link_and_stored_only_as_a_hash(): void
    {
        $this->boot2();
        $token = $this->invite('New@Acme.test');
        $this->assertMatchesRegularExpression('/^vti_[A-Za-z0-9]{48}$/', $token);
        $row = OrganizationInvitation::sole();
        $this->assertSame('new@acme.test', $row->email);
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertNotSame($token, $row->token_hash);
        $this->assertStringNotContainsString($token, json_encode(DB::table('organization_invitations')->get()));
        $this->assertArrayNotHasKey('token_hash', $row->toArray());
        $this->assertEqualsWithDelta(now()->addDays(7)->timestamp, $row->expires_at->timestamp, 5);
        $this->assertNotSame($token, $this->inviteTokenAgain());
        $body = json_encode($this->actingAs($this->owner)->getJson('/web-api/team')->json());
        $this->assertStringNotContainsString($token, $body);
    }

    private function inviteTokenAgain(): string
    {
        return $this->invite('other@acme.test');
    }

    public function test_the_real_email_carries_the_link_in_the_fragment_not_the_query(): void
    {
        $this->app->forgetInstance(\Illuminate\Notifications\ChannelManager::class);
        Notification::clearResolvedInstance(\Illuminate\Notifications\ChannelManager::class);
        $this->boot2();
        $this->actingAs($this->owner)->postJson('/web-api/team/invitations', ['email' => 'new@acme.test'])->assertCreated();
        $sent = $this->app['mailer']->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent);
        $mail = $sent[0]->getOriginalMessage();
        $body = $mail->getHtmlBody().$mail->getTextBody();
        $this->assertSame('new@acme.test', $mail->getTo()[0]->getAddress());
        $this->assertStringContainsString('You are invited to join Acme on Vibyra', $mail->getSubject());
        $this->assertSame(1, preg_match('~/team/join#token=vti_[A-Za-z0-9]{48}~', $body));
        $this->assertStringNotContainsString('?token', $body);
        $this->assertStringContainsString('expires in 7 days', $body);
    }

    public function test_tokens_have_high_entropy_and_never_repeat(): void
    {
        $this->boot2();
        $seen = [];
        foreach (range(1, 12) as $i) $seen[] = $this->invite("p$i@acme.test");
        $this->assertCount(12, array_unique($seen));
        foreach ($seen as $t) $this->assertGreaterThan(18, count(array_unique(str_split(substr($t, 4)))), 'a 48-character random secret uses many distinct characters');
        $this->assertSame(12, OrganizationInvitation::query()->distinct('token_hash')->count('token_hash'));
    }

    public function test_the_invited_person_accepts_once_and_becomes_a_member(): void
    {
        $this->boot2();
        $token = $this->invite('bob@acme.test');
        $bob = $this->person('bob@acme.test');
        $this->actingAs($bob)->postJson('/web-api/team/invitations/preview', ['token' => $token])->assertOk()->assertJsonPath('team', 'Acme')->assertJsonPath('email', 'bob@acme.test');
        $this->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertOk()->assertJsonPath('role', 'member');
        $this->assertSame($this->org->id, $this->memberOf($bob)->organization_id);
        $this->assertSame('invite', $this->memberOf($bob)->joined_via);
        // Reuse, by the same person or anyone else, is refused.
        $this->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertStatus(410)->assertJsonPath('code', 'invite_used');
        $this->actingAs($this->person('bob2@acme.test'))->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertStatus(410);
        $this->assertSame(2, OrganizationMember::count());
        $this->assertSame(['team.member_joined'], array_column($this->events($bob), 'event'));
        $this->assertContains('team.member_joined', array_column($this->events($this->owner), 'event'));
        $this->assertContains('team.invite_sent', array_column($this->events($this->owner), 'event'));
    }

    public function test_an_admin_invitation_gives_the_admin_role_and_only_owners_may_send_it(): void
    {
        $this->boot2();
        $token = $this->invite('ann@acme.test', 'admin');
        $ann = $this->person('ann@acme.test');
        $this->actingAs($ann)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertOk()->assertJsonPath('role', 'admin');
        $this->actingAs($ann)->postJson('/web-api/team/invitations', ['email' => 'x@acme.test', 'role' => 'admin'])->assertForbidden();
        $this->postJson('/web-api/team/invitations', ['email' => 'x@acme.test', 'role' => 'owner'])->assertStatus(422);
    }

    public function test_only_the_invited_verified_address_can_accept_and_a_wrong_try_does_not_burn_the_link(): void
    {
        $this->boot2();
        $token = $this->invite('bob@acme.test');
        $eve = $this->person('eve@evil.test');
        $this->actingAs($eve)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertForbidden()->assertJsonPath('code', 'wrong_account');
        $unverified = $this->person('bob@acme.test', ['email_verified_at' => null]);
        $this->actingAs($unverified)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertForbidden();
        $this->assertNull(OrganizationInvitation::sole()->accepted_at);
        $this->assertNull($this->memberOf($eve));
        $bob = $this->person('Bob@Acme.test');
        // (Unique emails: the unverified one above holds bob@acme.test, so verify it and let it accept.)
        $unverified->forceFill(['email_verified_at' => now()])->save();
        $this->actingAs($unverified)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertOk();
    }

    public function test_an_expired_invitation_is_refused_and_tokens_are_checked_for_shape(): void
    {
        $this->boot2();
        $token = $this->invite('bob@acme.test');
        $bob = $this->person('bob@acme.test');
        $this->travel(8)->days();
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $token])->assertStatus(410)->assertJsonPath('code', 'invite_expired');
        $this->postJson('/web-api/team/invitations/preview', ['token' => $token])->assertStatus(410);
        $this->travelBack();
        $this->postJson('/web-api/team/invitations/accept', ['token' => 'vti_short'])->assertStatus(410)->assertJsonPath('code', 'invite_invalid');
        $this->postJson('/web-api/team/invitations/accept', ['token' => 'vti_'.str_repeat('a', 48)])->assertStatus(410)->assertJsonPath('code', 'invite_invalid');
        $this->postJson('/web-api/team/invitations/accept', ['token' => $token.'x'])->assertStatus(410);
        $this->assertNull($this->memberOf($bob));
    }

    public function test_a_revoked_invitation_stops_working_and_inviting_again_replaces_the_old_link(): void
    {
        $this->boot2();
        $first = $this->invite('bob@acme.test');
        $id = OrganizationInvitation::sole()->id;
        $this->actingAs($this->owner)->deleteJson('/web-api/team/invitations/'.$id)->assertOk()->assertJsonPath('invitations', []);
        $bob = $this->person('bob@acme.test');
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $first])->assertStatus(410)->assertJsonPath('code', 'invite_revoked');
        $this->assertContains('team.invite_revoked', array_column($this->events($this->owner), 'event'));
        // A resend revokes the earlier link.
        $second = $this->invite('bob@acme.test');
        $third = $this->invite('bob@acme.test');
        $this->assertNotSame($second, $third);
        $this->actingAs($bob)->postJson('/web-api/team/invitations/accept', ['token' => $second])->assertStatus(410)->assertJsonPath('code', 'invite_revoked');
        $this->postJson('/web-api/team/invitations/accept', ['token' => $third])->assertOk();
    }
}
