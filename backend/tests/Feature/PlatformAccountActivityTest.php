<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, RemoteHost, User, VibyraSession};
use App\Services\Platform\AccountActivity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Roadmap Part 11: the append-only account activity log and its read-only list. */
class PlatformAccountActivityTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function on(): void
    {
        config(['platform.activity' => true]);
    }

    public function test_it_records_nothing_and_the_list_is_hidden_while_the_flag_is_off(): void
    {
        AccountActivity::record($this->user, 'sign_in', ['channel' => 'app']);
        $this->assertSame(0, AccountAuditEvent::count());
        $this->getJson('/api/account/activity')->assertNotFound()->assertJsonPath('code', 'not_available');
    }

    public function test_a_sign_in_a_grant_and_a_device_decision_each_leave_a_line(): void
    {
        $this->on();
        $this->postJson('/api/auth/login', ['email' => $this->user->email, 'password' => 'password'])->assertOk();
        $id = $this->gmailInstall('me@example.test');
        $this->grant($id, ['gmail_read']);
        $this->grant($id, ['gmail_read', 'gmail_search']);
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$id)->assertOk();
        $events = AccountAuditEvent::orderBy('id')->pluck('event')->all();
        $this->assertSame(['sign_in', 'grant.changed', 'grant.changed', 'grant.revoked'], $events);
        $first = AccountAuditEvent::where('event', 'grant.changed')->first();
        $this->assertSame(['provider' => 'gmail', 'operations' => 'gmail_read'], $first->detail);
        $this->assertSame('account', $first->actor);
    }

    public function test_the_list_is_the_signed_in_accounts_own_newest_first_with_paging(): void
    {
        $this->on();
        foreach (range(1, 5) as $i) AccountActivity::record($this->user, 'spend_cap.changed', ['day' => $i]);
        $other = User::factory()->create();
        AccountActivity::record($other, 'sign_in', ['channel' => 'app']);
        $page = $this->getJson('/api/account/activity?limit=2')->assertOk();
        $page->assertJsonCount(2, 'items')->assertJsonPath('items.0.detail.day', 5)->assertJsonPath('items.0.title', 'Changed a spending limit');
        $next = $page->json('next');
        $this->assertNotNull($next);
        $second = $this->getJson('/api/account/activity?limit=10&before='.$next)->assertOk();
        $second->assertJsonCount(3, 'items')->assertJsonPath('next', null);
        $this->assertNotContains('sign_in', array_column($second->json('items'), 'event'));
        $this->assertSame(0, collect($page->json('items'))->where('event', 'sign_in')->count());
    }

    public function test_the_browser_session_reads_it_too_and_a_signed_out_browser_cannot(): void
    {
        $this->on();
        AccountActivity::record($this->user, 'sign_in', ['channel' => 'website']);
        $this->app['auth']->forgetGuards();
        $this->withToken('')->getJson('/web-api/account/activity')->assertUnauthorized();
        $this->actingAs($this->user)->withToken('')->getJson('/web-api/account/activity')->assertOk()->assertJsonPath('items.0.event', 'sign_in');
    }

    public function test_the_log_is_append_only_in_the_model_and_in_the_database(): void
    {
        $this->on();
        AccountActivity::record($this->user, 'sign_in', ['channel' => 'app']);
        $row = AccountAuditEvent::first();
        $this->assertRefused(fn () => $row->update(['event' => 'edited']));
        $this->assertRefused(fn () => $row->delete());
        $this->assertRefused(fn () => DB::table('account_audit_events')->update(['event' => 'edited']));
        $this->assertSame('sign_in', AccountAuditEvent::first()->event);
        $this->getJson('/api/account/activity')->assertOk();
        foreach (['put', 'patch', 'delete'] as $verb) $this->{$verb.'Json'}('/api/account/activity')->assertStatus(405);
    }

    private function assertRefused(callable $change): void
    {
        try { $change(); $this->fail('The activity log accepted a change.'); }
        catch (\LogicException|\Illuminate\Database\QueryException $e) { $this->assertStringContainsString('append-only', $e->getMessage()); }
    }

    public function test_detail_keeps_short_metadata_and_never_a_credential(): void
    {
        $this->on();
        AccountActivity::record($this->user, 'api_key.created', ['name' => str_repeat('n', 500), 'token' => 'vyk_secret', 'password' => 'x',
            'apiSecret' => 'y', 'scopes' => ['runs:read', 'runs:create'], 'nested' => ['a' => 'b'], 'ok' => true, "bad\nkey" => 'z']);
        $detail = AccountAuditEvent::first()->detail;
        $this->assertSame(120, mb_strlen($detail['name']));
        $this->assertSame('runs:read, runs:create', $detail['scopes']);
        $this->assertTrue($detail['ok']);
        $this->assertSame(['name', 'scopes', 'ok'], array_keys($detail));
        AccountActivity::record($this->user, 'Not A Valid Event!');
        $this->assertSame(1, AccountAuditEvent::count());
    }

    public function test_a_failing_log_write_never_breaks_the_action_it_describes(): void
    {
        $this->on();
        DB::statement('DROP TRIGGER account_audit_events_no_update');
        DB::statement('ALTER TABLE account_audit_events RENAME TO account_audit_events_gone');
        AccountActivity::record($this->user, 'sign_in', ['channel' => 'app']); // must not throw
        $this->assertTrue(true);
    }

    public function test_deleting_the_account_removes_its_log(): void
    {
        $this->on();
        AccountActivity::record($this->user, 'sign_in', ['channel' => 'app']);
        $this->user->delete();
        $this->assertSame(0, AccountAuditEvent::count());
    }

    public function test_a_trusted_device_decision_and_removal_are_logged(): void
    {
        $this->on();
        $keys = sodium_crypto_box_keypair(); $phone = sodium_crypto_box_keypair();
        $host = RemoteHost::create(['user_id' => $this->user->id, 'host_id' => bin2hex(sodium_crypto_box_publickey($keys)),
            'name' => 'Home Mac', 'registered_at' => now(), 'authorization_generation' => 1]);
        $device = $this->postJson('/api/security/devices/register', ['hostId' => $host->host_id, 'publicKey' => bin2hex(sodium_crypto_box_publickey($phone)),
            'deviceName' => 'Phone', 'platform' => 'ios', 'permissions' => ['preview:access']])->assertOk()->json('device');
        $path = '/api/remote/hosts/'.$host->host_id.'/devices/'.$device['id'];
        $challenge = $this->postJson($path.'/challenge', ['decision' => 'approve'])->assertOk()->json();
        $this->postJson($path.'/decision', ['decision' => 'approve', 'challengeId' => $challenge['challengeId'],
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))])->assertOk();
        $this->deleteJson('/api/security/devices/'.$device['id'])->assertOk();
        $rows = AccountAuditEvent::orderBy('id')->get();
        $this->assertSame(['device.trusted', 'device.revoked'], $rows->pluck('event')->all());
        $this->assertSame('Phone', $rows[0]->detail['device']);
    }
}
