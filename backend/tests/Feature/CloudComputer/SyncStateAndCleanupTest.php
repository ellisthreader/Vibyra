<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{AccountCleanup, Retention};
use Illuminate\Support\Facades\{DB, Storage};

class SyncStateAndCleanupTest extends SyncTestCase
{
    private function state(): array { return $this->getJson('/api/cloud-computer')->assertOk()->json('computer'); }

    public function test_the_state_object_gains_sync_and_per_project_fields_and_stays_compatible(): void
    {
        $token = $this->vmReady();
        $this->registerHost($token)->assertOk();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'projects' => [['name' => 'cloned', 'repo' => 'o/r', 'branch' => 'main'], ['name' => 'my-app']]])->assertOk();
        $this->grant('my-app'); $this->grant('mac-only', str_repeat('5a', 16));
        $c = $this->state();
        $this->assertSame(['vmKeyReady' => true, 'pending' => 0, 'applying' => false, 'vm' => ['keyOk' => null, 'lastError' => null], 'usedBytes' => 0, 'limitBytes' => 5368709120], $c['sync']);
        $by = array_column($c['projects'], null, 'name');
        $this->assertSame(['cloned', 'my-app', 'mac-only'], array_keys($by));
        $this->assertSame(['name' => 'cloned', 'repo' => 'o/r', 'branch' => 'main', 'source' => 'cloud', 'syncedAt' => null, 'syncState' => null, 'allowed' => false], $by['cloned']);
        $this->assertSame(['mac', null, 'pending'], [$by['my-app']['source'], $by['my-app']['syncedAt'], $by['my-app']['syncState']]);
        $this->assertSame(['mac', 'pending', null, null], [$by['mac-only']['source'], $by['mac-only']['syncState'], $by['mac-only']['repo'], $by['mac-only']['branch']]);
        $this->assertArrayHasKey('hours', $c); $this->assertArrayHasKey('login', $c); $this->assertArrayHasKey('removeAt', $c);
    }

    public function test_pending_usage_and_synced_at_follow_the_uploads(): void
    {
        $token = $this->vmReady();
        $this->grant('my-app');
        $this->up('my-app', ['seq' => 1], random_bytes(1500))->assertOk();
        $s = $this->state()['sync'];
        $this->assertSame([1, 1500], [$s['pending'], $s['usedBytes']]);
        $id = $this->asRuntime($token, 'get', 'sync/pending')->json('items.0.id');
        $this->asRuntime($token, 'post', 'sync/blobs/'.$id.'/applied', ['ok' => true, 'state' => 'synced'])->assertOk();
        $c = $this->state();
        $this->assertSame(0, $c['sync']['pending']);
        $this->assertSame('synced', $c['projects'][0]['syncState']);
        $this->assertNotNull($c['projects'][0]['syncedAt']);
    }

    public function test_the_state_has_no_sync_without_a_computer_and_a_key_is_not_ready_before_boot(): void
    {
        $this->assertNull(app(\App\Services\CloudComputer\Computers::class)->payload($this->user->id)['computer']);
        $this->grant('my-app');
        $this->computerReady();
        $this->assertFalse($this->state()['sync']['vmKeyReady']);
    }

    private function removedVolume(): string
    {
        $token = $this->vmReady();
        $this->registerHost($token)->assertOk();
        return $token;
    }

    private function overdue(): void
    {
        $this->sleepNow();
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['volume_id' => 'vol', 'updated_at' => now()->subDays(40), 'retention_warned_at' => now()->subDays(5)]);
    }

    public function test_when_retention_removes_the_volume_every_project_starts_over(): void
    {
        $token = $this->removedVolume();
        $this->registerMac(); $this->grant('one'); $this->grant('two', str_repeat('6b', 16));
        $this->up('one')->assertOk(); $this->up('two')->assertOk();
        foreach ($this->asRuntime($token, 'get', 'sync/pending')->json('items') as $i) { $this->asRuntime($token, 'post', 'sync/blobs/'.$i['id'].'/applied', ['ok' => true])->assertOk(); }
        [$down, $q] = $this->q(['seq' => 1]);
        $this->runtimeRaw($token, 'PUT', 'projects/one/down?'.http_build_query($q + ['mac' => $this->deviceId]), $down)->assertOk();
        $this->assertSame([1, 1], array_column($this->sync('get', '/')->json('projects'), 'upAppliedSeq'));
        $this->overdue();
        app(Retention::class)->reconcile($this->row());
        $this->assertNotNull($this->row()->retention_deleted_at);
        $r = $this->sync('get', '/')->assertOk();
        $this->assertNull($r->json('vmKey'));
        foreach ($r->json('projects') as $p) {
            $this->assertSame([true, 0, 'pending', 1], [$p['resync'], $p['upAppliedSeq'], $p['state'], $p['upSeq']]);
        }
        // The VM's sealed copies can no longer be read by anyone; the way back to the Mac stays.
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('direction', 'up')->count());
        $this->assertSame(1, DB::table('cloud_sync_blobs')->where('direction', 'down')->count());
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        $this->up('one', ['seq' => 2, 'baseSeq' => 1])->assertStatus(409)->assertJsonPath('code', 'resync_required');
        // A project granted after the volume went is a full upload too.
        $this->assertTrue($this->grant('three', str_repeat('7c', 16))['resync']);
        $this->up('one', ['seq' => 2])->assertOk()->assertJsonPath('project.resync', false);
        // ...and that upload starts the computer on a fresh volume to take it (Wake::forSync), with nobody waking it.
        $this->assertSame('starting', $this->row()->state);
    }

    public function test_a_computer_that_keeps_its_volume_keeps_its_sync_data(): void
    {
        $this->removedVolume();
        $this->grant('one'); $this->up('one')->assertOk();
        $this->overdue();
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['updated_at' => now()->subDays(2), 'retention_warned_at' => null]);
        app(Retention::class)->reconcile($this->row());
        $this->assertNull($this->row()->retention_deleted_at);
        $this->assertSame([false, 0], [$this->sync('get', '/')->json('projects.0.resync'), 0]);
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
    }

    public function test_account_deletion_cleanup_removes_every_blob_and_row_but_only_this_accounts(): void
    {
        $this->registerMac(); $this->grant('mine'); $this->up('mine')->assertOk();
        [$other, $token] = $this->otherAccount();
        $this->grant('theirs', null, $token); $this->up('theirs', [], null, $token)->assertOk();
        $this->assertCount(2, Storage::disk('cloud-sync')->allFiles());
        app(AccountCleanup::class)->prepare($this->user->id);
        $this->assertCount(1, Storage::disk('cloud-sync')->allFiles());
        foreach (['cloud_sync_blobs', 'cloud_sync_projects', 'cloud_sync_macs'] as $t) $this->assertSame(0, DB::table($t)->where('user_id', $this->user->id)->count(), $t);
        $this->assertSame(1, DB::table('cloud_sync_blobs')->where('user_id', $other->id)->count());
        $this->assertStringStartsWith($other->id.'/', Storage::disk('cloud-sync')->allFiles()[0]);
    }

    public function test_deleting_the_user_row_cascades_the_sync_tables(): void
    {
        $this->registerMac(); $this->grant('mine'); $this->up('mine')->assertOk();
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => $this->macKey, 'name' => 'x']);
        DB::table('cloud_sync_vm_keys')->insert(['user_id' => $this->user->id, 'public_key' => str_repeat('b2', 32), 'created_at' => now(), 'updated_at' => now()]);
        DB::statement('PRAGMA foreign_keys = ON');
        app(AccountCleanup::class)->prepare($this->user->id);
        foreach (['cloud_sync_blobs', 'cloud_sync_projects', 'cloud_sync_macs', 'cloud_sync_vm_keys'] as $t) $this->assertSame(0, DB::table($t)->count(), $t);
    }

    public function test_the_prune_command_is_scheduled_and_idempotent(): void
    {
        $this->artisan('vibyra:cloud-sync-prune')->assertSuccessful();
        $scheduled = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->contains(fn ($e) => str_contains($e->command, 'vibyra:cloud-sync-prune'));
        $this->assertTrue($scheduled);
        // Abandoned downloads (never fetched for 30 days) are dropped.
        $this->registerMac(); $this->grant('mine'); $token = $this->vmReady();
        [$c, $q] = $this->q(['seq' => 1]);
        $this->runtimeRaw($token, 'PUT', 'projects/mine/down?'.http_build_query($q + ['mac' => $this->deviceId]), $c)->assertOk();
        $this->travel(29)->days(); $this->artisan('vibyra:cloud-sync-prune'); $this->assertSame(1, DB::table('cloud_sync_blobs')->count());
        $this->travel(2)->days(); $this->artisan('vibyra:cloud-sync-prune'); $this->assertSame(0, DB::table('cloud_sync_blobs')->count());
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
    }
}
