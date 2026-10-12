<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Auth\SessionAuthenticator;
use App\Services\Account\AccountAccess;
use App\Services\Owner\AccountNotices;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Notification};
use Tests\TestCase;

class OwnerAccountModerationTest extends TestCase
{
    use RefreshDatabase, Concerns\OwnerAccountFixtures;
    protected function setUp(): void { parent::setUp(); $this->accounts(); $this->unlockOwner(); }

    public function test_warning_is_target_only_and_internal_reason_is_never_in_the_user_payload(): void
    {
        $terms = $this->action(['action' => 'warn', 'message' => '<script>literal warning text</script>', 'reason' => 'Private owner context']);
        $this->postJson($this->accountUrl().'/actions', $terms)->assertOk();
        $this->postJson($this->accountUrl().'/actions', $terms)->assertOk();
        $warnings = AccountNotices::warnings($this->target->id);
        $this->assertCount(1, $warnings);
        $this->assertSame($terms['message'], $warnings[0]->message);
        $this->assertStringNotContainsString($terms['reason'], json_encode($warnings));
        $this->assertSame([], AccountNotices::warnings($this->owner->id));
        $this->actingAs($this->target)->getJson('/web-api/session')->assertOk()
            ->assertJsonPath('user.accountWarnings.0.message', $terms['message'])->assertJsonPath('user.ownerAccess', false);
        Notification::assertNothingSent();
    }

    public function test_ban_revokes_sessions_and_unban_does_not_revive_them(): void
    {
        $session = VibyraSession::create(['user_id' => $this->target->id, 'token_hash' => hash('sha256', 'old-session')]);
        $terms = $this->action(['action' => 'ban']); $url = $this->accountUrl().'/actions';
        $this->postJson($url, $terms)->assertOk()->assertJsonPath('receipt.status', 'banned');
        $this->postJson($url, $terms)->assertOk();
        $this->assertNotNull($this->target->fresh()->owner_banned_at);
        $this->assertNotNull($session->fresh()->revoked_at);
        $this->assertFalse(AccountAccess::allowed($this->target->id));
        $this->assertNull(app(SessionAuthenticator::class)->authenticate('old-session'));
        $this->getJson('/web-api/owner/accounts?status=banned')->assertJsonPath('total', 1);
        $this->postJson($url, $this->action(['action' => 'unban', 'revision' => 1]))->assertOk();
        $this->assertTrue(AccountAccess::allowed($this->target->id));
        $this->assertNull(app(SessionAuthenticator::class)->authenticate('old-session'));
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
    }

    public function test_existing_cookie_and_new_native_and_website_sign_ins_are_blocked(): void
    {
        $this->target->forceFill(['owner_banned_at' => now()])->save();
        $this->actingAs($this->target)->getJson('/web-api/session')->assertForbidden()->assertJsonPath('code', 'account_banned');
        $credentials = ['email' => $this->target->email, 'password' => 'password'];
        $this->postJson('/web-api/auth/login', $credentials)->assertForbidden()->assertJsonPath('code', 'account_banned');
        $this->postJson('/api/auth/login', $credentials)->assertForbidden()->assertJsonPath('code', 'account_banned');
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }

    public function test_a_cookie_saved_before_ban_does_not_revive_after_unban_on_any_session_driver(): void
    {
        $url = $this->accountUrl().'/actions';
        $this->postJson($url, $this->action(['action' => 'ban']))->assertOk();
        $this->postJson($url, $this->action(['action' => 'unban', 'revision' => 1]))->assertOk();
        $this->assertSame(1, $this->target->fresh()->account_session_epoch);
        $this->actingAs($this->target)->withSession(['account_session_epoch' => 0])
            ->getJson('/web-api/session')->assertUnauthorized();
        $this->postJson('/web-api/auth/login', ['email' => $this->target->email, 'password' => 'password'])->assertOk();
        $this->assertSame(1, session('account_session_epoch'));
        $this->getJson('/web-api/session')->assertOk()->assertJsonPath('user.id', $this->target->id);
    }

    public function test_stale_bearer_snapshot_and_agent_admission_cannot_bypass_the_ban(): void
    {
        VibyraSession::create(['user_id' => $this->target->id, 'token_hash' => hash('sha256', 'stale-session')]);
        config(['agents_v2.enabled' => true, 'agents_v2.user_ids' => '*']);
        $this->assertTrue(app(\App\Services\AgentRuns\Access::class)->allows($this->target->id));
        DB::table('users')->where('id', $this->target->id)->update(['owner_banned_at' => now()]);
        $this->assertNull(app(SessionAuthenticator::class)->authenticate('stale-session'));
        $this->assertFalse(app(\App\Services\AgentRuns\Access::class)->allows($this->target->id));
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        app(\App\Services\CloudWorkspaces\Eligibility::class)->authorize($this->target->id);
    }

    public function test_ordinary_mass_assignment_cannot_set_or_clear_moderation_and_owner_link_is_server_computed(): void
    {
        $this->target->fill(['owner_banned_at' => now(), 'owner_action_revision' => 99])->save();
        $this->assertNull($this->target->fresh()->owner_banned_at);
        $this->assertEquals(0, $this->target->fresh()->owner_action_revision);
        $this->getJson('/web-api/session')->assertJsonPath('user.ownerAccess', true);
        $this->owner->forceFill(['email_verified_at' => null])->save();
        $this->assertFalse(AccountNotices::owner($this->owner->fresh()));
    }
}
