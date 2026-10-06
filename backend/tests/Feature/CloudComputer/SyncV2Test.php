<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{SyncKeys, Wake};
use App\Services\CloudWorkspaces\Lifecycle;
use Illuminate\Support\Facades\{Cache, DB};

/** Cloud sync v2 (docs/cloud-sync-v2-plan.md): the server wakes Cloud for synced work, owns one status per project, hears the Mac. */
class SyncV2Test extends SyncTestCase
{
    private function phaseOf(?string $key = null): ?array
    {
        $rows = collect($this->getJson('/api/cloud-computer/access')->assertOk()->json('projects'));
        return $rows->firstWhere('projectKey', $key ?? $this->key)['cloud']['status'] ?? null;
    }

    private function report(array $body, ?string $device = null): \Illuminate\Testing\TestResponse
    {
        return $this->sync('put', '/macs/'.($device ?? $this->deviceId).'/status', $body + ['paused' => false]);
    }

    private function asleep(): void
    {
        $this->sleepNow();
        Cache::forget('cloud-sync-wake:'.$this->user->id); // the 2-minute debounce, not the per-upload tries
        $this->assertSame('stopped', $this->row()->state);
    }

    /** A booted computer whose Host reached the relay (Idle otherwise stops it as host_unreachable). */
    private function hostUp(string $vm): void
    {
        $this->registerHost($vm)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['last_seen_at' => now()]);
    }

    public function test_an_upload_to_a_sleeping_computer_wakes_it_and_it_stays_up_until_applied(): void
    {
        $vm = $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->asleep();
        $this->up('my-app')->assertOk();
        $this->assertSame('starting', $this->row()->state, 'the upload started Cloud: nobody has to wake it');
        $this->assertNull($this->row()->app_session_id, 'a sync wake has no phone session');
        // Booted again: idle never fires while the upload waits, even long past the 300 s idle time.
        $vm = $this->computerReady(); $this->hostUp($vm);
        $hold = fn () => DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->addHour(), 'deadline_at' => now()->addHours(8)]);
        $this->travel(400)->seconds(); $hold();
        $this->assertNull(app(Lifecycle::class)->stopReason($this->row()));
        $id = $this->asRuntime($vm, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => true, 'state' => 'synced'])->assertOk();
        $this->assertSame('ready', $this->phaseOf()['phase']);
        // Applied: the usual idle tail from the apply.
        $this->travel(301)->seconds(); $hold();
        $this->assertSame('idle', app(Lifecycle::class)->stopReason($this->row()));
    }

    public function test_work_that_stops_moving_no_longer_holds_the_computer(): void
    {
        $vm = $this->vmReady(); $this->hostUp($vm); $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $hold = fn () => DB::table('cloud_workspaces')->where('id', $this->cid)->update(['lease_until' => now()->addHour(), 'deadline_at' => now()->addHours(8)]);
        $this->travel(1700)->seconds(); $hold();
        $this->assertNull(app(Lifecycle::class)->stopReason($this->row()));
        $this->travel(101)->seconds(); $hold();
        $this->assertSame('idle', app(Lifecycle::class)->stopReason($this->row()));
        // A Mac still sending keeps it moving.
        $this->report(['current' => ['projectKey' => $this->key, 'kind' => 'code', 'sent' => 8, 'total' => 64]])->assertOk();
        $this->assertNull(app(Lifecycle::class)->stopReason($this->row()));
    }

    public function test_sync_wakes_are_debounced_and_give_up_on_an_upload_that_never_applies(): void
    {
        $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        for ($i = 0; $i < Wake::SYNC_WAKE_TRIES; $i++) {
            $this->asleep();
            app(Wake::class)->forSync($this->user->id);
            $this->assertSame('starting', $this->row()->state);
            app(Wake::class)->forSync($this->user->id); // already starting: nothing
            $this->computerReady();
        }
        $this->asleep();
        app(Wake::class)->forSync($this->user->id);
        $this->assertSame('stopped', $this->row()->state, 'the same stuck upload does not start Cloud a fourth time');
        // The person asking ("Sync again") still goes.
        $this->postJson('/api/cloud-computer/sync/repair', [])->assertOk();
        $this->assertSame('starting', $this->row()->state);
    }

    public function test_a_first_project_with_no_computer_key_starts_cloud_for_its_key(): void
    {
        $this->createComputer(); $this->registerMac();
        DB::table('cloud_workspaces')->update(['terms_accepted_at' => now()]); // Connect covers the terms
        $this->allowKey($this->key);
        $this->assertSame('waiting_cloud', $this->phaseOf()['phase']);
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'my-app'])->assertOk();
        $this->assertSame('starting', $this->row()->state);
        $this->assertTrue($this->sync('get', '?mac='.$this->deviceId)->assertOk()->json('connected'));
    }

    public function test_one_status_per_project_from_everything_the_server_knows(): void
    {
        $vm = $this->vmReady();
        $this->allowKey($this->key);
        $this->assertSame('waiting_mac', $this->phaseOf()['phase'], 'ticked, no Mac has said anything');
        $this->registerMac();
        $this->assertSame('preparing', $this->phaseOf()['phase'], 'a Mac online: it is getting it ready');
        $this->report(['paused' => true])->assertOk();
        $this->assertSame('mac_paused', $this->phaseOf()['phase']);
        $this->report(['current' => ['projectKey' => $this->key, 'kind' => 'code', 'sent' => 16, 'total' => 64]])->assertOk();
        $this->assertSame(['phase' => 'uploading', 'sent' => 16, 'total' => 64], array_intersect_key($this->phaseOf(), array_flip(['phase', 'sent', 'total'])));
        $this->assertSame('syncing', $this->getJson('/api/cloud-computer/access')->json('macs.0.state'));
        $this->grant('my-app'); $this->up('my-app')->assertOk();
        $this->report([])->assertOk();
        $this->assertSame('saved', $this->phaseOf()['phase'], 'sent, Cloud has not opened it yet');
        $this->asRuntime($vm, 'post', 'sync/status', ['applying' => true, 'keyOk' => true])->assertOk();
        $this->assertSame('applying', $this->phaseOf()['phase']);
        $id = $this->asRuntime($vm, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => true, 'state' => 'synced'])->assertOk();
        $this->asRuntime($vm, 'post', 'sync/status', ['applying' => false])->assertOk();
        $s = $this->phaseOf();
        $this->assertSame('ready', $s['phase']);
        $this->assertNotNull($s['appliedAt']);
        // The Mac's own failure for this project, then Cloud's.
        $this->report(['projects' => [['projectKey' => $this->key, 'phase' => 'error', 'code' => 'upload_failed', 'message' => 'Network went away.']]])->assertOk();
        $this->assertSame(['needs_attention', 'mac', 'Network went away.'], [$this->phaseOf()['phase'], $this->phaseOf()['fixOn'], $this->phaseOf()['message']]);
        $this->report([])->assertOk();
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $id = $this->asRuntime($vm, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => false, 'error' => 'disk_full', 'code' => 'disk_full', 'message' => 'No space'])->assertOk();
        $s = $this->phaseOf();
        $this->assertSame(['needs_attention', 'disk_full', 'cloud'], [$s['phase'], $s['code'], $s['fixOn']]);
        $this->assertSame('Vibyra Cloud ran out of space for this project.', $s['message']);
    }

    public function test_a_key_mismatch_is_a_resend_not_an_error(): void
    {
        $vm = $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $id = $this->asRuntime($vm, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => false, 'error' => 'key_mismatch', 'code' => 'key_mismatch', 'needFull' => true])->assertOk();
        $p = $this->sync('get', '/')->json('projects.0');
        $this->assertSame(['pending', 'needs_full', true], [$p['state'], $p['reason'], $p['resync']]);
        $this->assertSame('preparing', $this->phaseOf()['phase'], 'the Mac sends the whole project again');
        // An incremental the computer cannot use says so too.
        $this->up('my-app', ['seq' => 2, 'baseSeq' => 0])->assertOk();
        $this->assertSame('saved', $this->phaseOf()['phase']);
    }

    public function test_skipped_shows_the_size_the_mac_reported(): void
    {
        $this->vmReady(); $this->registerMac();
        $this->allowKey($this->key);
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'big', 'skipped' => ['reason' => 'too_large']])->assertOk();
        $this->report(['projects' => [['projectKey' => $this->key, 'phase' => 'done', 'bytes' => 3_500_000_000]]])->assertOk();
        $s = $this->phaseOf();
        $this->assertSame(['skipped', 'too_large', 3_500_000_000, 536870912], [$s['phase'], $s['code'], $s['bytes'], $s['limitBytes']]);
    }

    public function test_mac_reports_need_no_agreement_and_an_unknown_mac_must_register(): void
    {
        $this->registerMac();
        DB::table('cloud_connect_consents')->update(['revoked_at' => now()]);
        $this->report(['paused' => true, 'gate' => 'off'])->assertOk();
        $this->assertSame('paused', $this->getJson('/api/cloud-computer/access')->json('macs.0.state'));
        $this->assertFalse($this->sync('get', '/')->json('connected'));
        $this->report([], (string) \Illuminate\Support\Str::uuid())->assertStatus(404)->assertJsonPath('code', 'mac_unknown');
        $this->report(['current' => ['projectKey' => 'nope']])->assertStatus(422);
        // Offline once it stops checking in.
        $this->travel(SyncKeys::MAC_ONLINE_SECONDS + 1)->seconds();
        $this->assertSame('offline', $this->getJson('/api/cloud-computer/access')->json('macs.0.state'));
    }

    public function test_repair_resets_a_failed_project_without_deleting_anything(): void
    {
        $vm = $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $id = $this->asRuntime($vm, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($vm, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => false, 'code' => 'apply_failed', 'error' => 'apply_failed'])->assertOk();
        $this->assertSame('needs_attention', $this->phaseOf()['phase']);
        $r = $this->postJson('/api/cloud-computer/sync/repair', ['projectKey' => $this->key])->assertOk();
        $this->assertSame(1, $r->json('repaired'));
        $this->assertSame(['pending', null, true], [$r->json('projects.0.state'), $r->json('projects.0.reason'), $r->json('projects.0.resync')]);
        $this->assertSame(1, DB::table('cloud_sync_projects')->count());
        $this->assertSame(1, DB::table('cloud_sync_macs')->count());
        $this->assertNotNull(app(SyncKeys::class)->vmKey($this->user->id));
        $this->assertSame('preparing', $this->phaseOf()['phase']);
        $this->postJson('/api/cloud-computer/sync/repair', ['projectKey' => 'zz'])->assertStatus(422);
    }

    public function test_disconnect_twice_changes_nothing_the_second_time(): void
    {
        $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->deleteJson('/api/cloud-computer/connect')->assertOk();
        $this->assertSame(0, DB::table('cloud_sync_projects')->count());
        $revokedAt = DB::table('cloud_connect_consents')->value('revoked_at');
        $calls = count($this->provider->calls);
        $this->travel(5)->seconds();
        $this->deleteJson('/api/cloud-computer/connect')->assertOk()->assertJsonPath('connected', false);
        $this->assertSame($revokedAt, DB::table('cloud_connect_consents')->value('revoked_at'));
        $this->assertSame($calls, count($this->provider->calls));
    }

    public function test_rate_limits_are_per_account_not_per_address(): void
    {
        [, $other] = $this->otherAccount();
        $this->createComputer();
        for ($i = 0; $i < 6; $i++) $this->postJson('/api/cloud-computer/sync/repair', [])->assertOk();
        $this->postJson('/api/cloud-computer/sync/repair', [])->assertStatus(429);
        $this->withToken($other)->postJson('/api/cloud-computer/sync/repair', [])->assertOk();
    }

    public function test_the_vm_reports_its_key_and_last_failure(): void
    {
        $vm = $this->vmReady();
        $this->asRuntime($vm, 'post', 'sync/status', ['applying' => false, 'keyOk' => false, 'lastError' => ['code' => 'remove_failed', 'message' => 'EACCES', 'project' => 'my-app']])->assertOk();
        $h = $this->getJson('/api/cloud-computer')->json('computer.sync.vm');
        $this->assertSame([false, 'remove_failed', 'my-app'], [$h['keyOk'], $h['lastError']['code'], $h['lastError']['project']]);
        $this->asRuntime($vm, 'post', 'sync/status', ['applying' => false])->assertOk();
        $this->assertSame('remove_failed', $this->getJson('/api/cloud-computer')->json('computer.sync.vm.lastError.code'), 'an old image never clears it by accident');
        $this->asRuntime($vm, 'post', 'sync/status', ['applying' => false, 'keyOk' => true, 'lastError' => null])->assertOk();
        $this->assertSame([true, null], array_values($this->getJson('/api/cloud-computer')->json('computer.sync.vm')));
    }

    public function test_a_removal_is_offered_for_a_few_minutes_not_a_day(): void
    {
        $vm = $this->vmReady(); $this->registerMac(); $this->grant('my-app');
        $this->sync('delete', '/projects/my-app')->assertOk();
        $this->assertSame(['my-app'], $this->asRuntime($vm, 'get', 'sync/pending')->json('removed'));
        $this->travel(60)->seconds();
        $this->assertSame(['my-app'], $this->asRuntime($vm, 'get', 'sync/pending')->json('removed'), 'a retry if its delete failed');
        $this->travel(300)->seconds();
        $this->assertSame([], $this->asRuntime($vm, 'get', 'sync/pending')->json('removed'));
    }
}
