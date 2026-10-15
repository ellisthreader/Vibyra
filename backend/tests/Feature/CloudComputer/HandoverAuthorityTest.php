<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\Activity\{EventAuthority, Fanout, HostEvents};
use App\Services\CloudComputer\Owners\ConversationOwners;
use App\Services\CloudComputer\Projects;
use App\Services\Notifications\Inbox;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;

class HandoverAuthorityTest extends ActivityTestCase
{
    public static function revocations(): array
    {
        return [['agreement'], ['project'], ['generation']];
    }

    private function revoke(string $kind): void
    {
        match ($kind) {
            'agreement' => DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->update(['revoked_at' => now()]),
            'project' => DB::table('cloud_project_access')->where('user_id', $this->user->id)->where('name', 'my-app')->update(['allowed' => false]),
            'generation' => DB::table('cloud_workspaces')->where('id', $this->cid)->increment('generation'),
        };
    }

    private function notifications(): void
    {
        config(['intelligence.host_events' => true, 'intelligence.events' => true, 'intelligence.inbox' => true]);
    }

    public function test_owner_service_rechecks_withdrawal_even_after_the_route_had_checked_consent(): void
    {
        $this->liveComputer();
        $owners = app(ConversationOwners::class);
        $this->assertTrue(app(\App\Services\CloudComputer\ConnectConsent::class)->connected($this->user->id));
        $this->revoke('agreement');
        foreach (['pc', 'cloud'] as $to) {
            try { $owners->set($this->user->id, 'claude', self::A, 'my-app', $to, 0, null); $this->fail('Withdrawn owner write accepted'); }
            catch (HttpResponseException $e) {
                $this->assertSame(409, $e->getResponse()->getStatusCode());
                $this->assertSame('connect_required', $e->getResponse()->getData(true)['code']);
            }
        }
        $this->assertDatabaseCount(ConversationOwners::TABLE, 0);
    }

    public function test_ingest_refuses_a_runtime_snapshot_from_before_a_new_generation(): void
    {
        $this->liveComputer(); $snapshot = $this->row();
        $this->revoke('generation');
        try { app(HostEvents::class)->ingest($snapshot, [$this->ev(self::A, 'running')]); $this->fail('Stale runtime accepted'); }
        catch (HttpException $e) { $this->assertSame(401, $e->getStatusCode()); }
        $this->assertDatabaseCount(HostEvents::TABLE, 0);
    }

    public function test_withdrawn_agreement_and_unticked_projects_cannot_repopulate_activity(): void
    {
        $token = $this->liveComputer(); $this->notifications();
        $this->revoke('project');
        $this->report($token, [$this->ev(self::A, 'waiting')])->assertOk()->assertJsonPath('accepted', 0)->assertJsonPath('rejected', 1);
        $this->revoke('agreement');
        $this->report($token, [$this->ev(self::B, 'waiting')])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->assertDatabaseCount(HostEvents::TABLE, 0);
        $this->assertDatabaseCount('notification_items', 0);
    }

    public function test_native_queue_is_authority_but_host_listing_and_removed_sync_names_are_not(): void
    {
        $token = $this->liveComputer();
        app(Projects::class)->queue($this->row(), 'native-app', null, null);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['host_projects' => json_encode([['name' => 'reported-only']])]);
        $this->report($token, [$this->ev(self::A, 'running', null, 'claude', 'native-app'), $this->ev(self::B, 'running', null, 'claude', 'reported-only')])
            ->assertOk()->assertJsonPath('accepted', 1)->assertJsonPath('rejected', 1);
        DB::table('cloud_sync_projects')->insert(['user_id' => $this->user->id, 'project_key' => str_repeat('a', 32), 'name' => 'native-app',
            'state' => 'synced', 'removed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->report($token, [$this->ev(self::A, 'waiting', null, 'claude', 'native-app')])->assertOk()->assertJsonPath('accepted', 0)->assertJsonPath('rejected', 1);
    }

    public function test_a_late_returned_receipt_cannot_recreate_data_after_withdrawal(): void
    {
        $this->liveComputer();
        $this->revoke('agreement');
        $this->assertFalse(app(HostEvents::class)->returned($this->user->id, 'claude', self::A, 'my-app'));
        $this->assertDatabaseCount(HostEvents::TABLE, 0);
    }

    #[DataProvider('revocations')]
    public function test_fanout_rechecks_access_after_ingest_commits(string $kind): void
    {
        $this->liveComputer(); $this->notifications(); $snapshot = $this->row();
        $stored = app(HostEvents::class)->ingest($snapshot, [$this->ev(self::A, 'waiting')]);
        $this->assertSame(1, $stored['accepted']);
        $this->revoke($kind);
        app(Fanout::class)->run($snapshot, $stored['new']);
        $this->assertDatabaseCount('notification_items', 0);
    }

    #[DataProvider('revocations')]
    public function test_delayed_outbox_and_live_feed_refuse_withdrawn_or_old_boot_events(string $kind): void
    {
        $token = $this->liveComputer(); $this->notifications();
        $this->report($token, [$this->ev(self::A, 'waiting')])->assertOk()->assertJsonPath('accepted', 1);
        $event = DB::table(HostEvents::TABLE)->first();
        $item = DB::table('notification_items')->first();
        $this->assertSame((int) $this->row()->generation, (int) $event->runtime_generation);
        $this->assertNotNull(app(EventAuthority::class)->deliveryCurrent($event));
        $this->assertTrue(app(Inbox::class)->current($item));
        $this->revoke($kind);
        $this->assertNull(app(EventAuthority::class)->deliveryCurrent($event));
        $this->assertFalse(app(Inbox::class)->current($item));
        $this->feed()->assertOk()->assertJsonPath('running', [])->assertJsonPath('approvals', 0);
    }
    public function test_explicitly_malformed_conversation_metadata_cannot_be_treated_as_legacy(): void
    {
        $token = $this->liveComputer(); $this->notifications();
        $this->report($token, [$this->ev(self::A, 'waiting')])->assertOk();
        $item = DB::table('notification_items')->first();
        $destination = json_decode($item->destination, true);
        foreach ([null, 'bad', [], ['provider' => 'claude']] as $invalid) {
            $item->destination = json_encode([...$destination, 'agentSession' => $invalid]);
            $this->assertFalse(app(Inbox::class)->current($item));
        }
        unset($destination['agentSession']);
        $item->destination = json_encode($destination);
        $this->assertTrue(app(Inbox::class)->current($item), 'Legacy notifications without conversation metadata retain their contract');
    }
}
