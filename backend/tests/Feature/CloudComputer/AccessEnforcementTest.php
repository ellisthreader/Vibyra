<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** The server wins (docs/cloud-access-contract.md): grants and uploads for projects nobody ticked are refused. */
class AccessEnforcementTest extends SyncTestCase
{
    public function test_a_grant_for_a_project_that_is_not_allowed_is_refused_and_stores_nothing(): void
    {
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'my-app'])->assertStatus(409)
            ->assertJsonPath('ok', false)->assertJsonPath('code', 'project_not_allowed')->assertJsonPath('projectKey', $this->key);
        $this->assertSame(0, DB::table('cloud_sync_projects')->count());
        DB::table('cloud_project_access')->insert(['user_id' => $this->user->id, 'project_key' => $this->key, 'name' => 'My app', 'allowed' => false, 'source' => 'phone', 'created_at' => now(), 'updated_at' => now()]);
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'my-app'])->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
    }

    public function test_a_skipped_report_passes_but_never_revives_a_removed_project(): void
    {
        $skip = fn () => $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'huge', 'skipped' => ['reason' => 'too_large']]);
        $skip()->assertOk()->assertJsonPath('project.state', 'skipped');
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'huge'])->assertStatus(409); // un-skipping needs the tick
        $this->sync('delete', '/projects/huge')->assertOk();
        $skip()->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->assertNotNull(DB::table('cloud_sync_projects')->where('project_key', $this->key)->value('removed_at'));
    }

    public function test_uploads_for_a_project_that_is_not_allowed_are_refused(): void
    {
        $this->registerMac(); $this->grant('my-app');
        DB::table('cloud_project_access')->where('project_key', $this->key)->update(['allowed' => false]); // e.g. an un-grandfathered row
        $this->up('my-app')->assertStatus(409)->assertJsonPath('code', 'project_not_allowed')->assertJsonPath('projectKey', $this->key);
        $content = random_bytes(1024);
        $q = ['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => '-', 'sha256' => hash('sha256', $content), 'offset' => 0, 'total' => 1024];
        $this->raw('PUT', '/api/cloud-computer/sync/projects/my-app/up-part?'.http_build_query($q), $content, 'cloud-test')->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->assertSame(0, DB::table('cloud_sync_blobs')->count());
    }

    public function test_the_state_object_gains_allowed_and_capacity(): void
    {
        $this->createComputer();
        $this->grant('my-app');
        $this->sync('post', '/projects', ['projectKey' => str_repeat('5a', 16), 'name' => 'held', 'skipped' => ['reason' => 'too_large']])->assertOk();
        $s = $this->getJson('/api/cloud-computer')->assertOk()->json();
        $this->assertSame(['used' => 1, 'limit' => 1], $s['capacity']['computers']);
        $by = collect($s['computer']['projects'])->keyBy('name');
        $this->assertSame([true, false], [$by['my-app']['allowed'], $by['held']['allowed']]);
        $this->assertSame(['mac', 'pending'], [$by['my-app']['source'], $by['my-app']['syncState']]); // existing keys unchanged
    }

    public function test_the_grandfathering_migration_keeps_projects_that_already_synced(): void
    {
        $this->registerMac(); $this->grant('synced'); $this->up('synced')->assertOk();
        $this->grant('never-uploaded', str_repeat('1a', 16));
        $this->grant('removed', str_repeat('2b', 16)); $this->up('removed')->assertOk(); $this->sync('delete', '/projects/removed')->assertOk();
        $migration = require database_path('migrations/2026_10_04_300000_create_cloud_project_access.php');
        $migration->down(); $migration->up();
        $rows = DB::table('cloud_project_access')->get();
        $this->assertSame([[$this->key, 'synced', true, 'mac']], $rows->map(fn ($r) => [$r->project_key, $r->name, (bool) $r->allowed, $r->source])->all());
        $this->up('synced', ['seq' => 2, 'baseSeq' => 1])->assertOk();
        $this->up('never-uploaded')->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
    }
}
