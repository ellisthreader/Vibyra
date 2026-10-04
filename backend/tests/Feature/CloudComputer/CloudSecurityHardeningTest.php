<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\SyncUploadParts;
use Illuminate\Support\Facades\DB;

/** Cloud security audit 2026-10-03: the phone agreement is enforced on every path that starts or stores, it can be
 *  withdrawn, and unfinished uploads cannot fill the server's disk. */
class CloudSecurityHardeningTest extends SyncTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.sync_parts_dir' => sys_get_temp_dir().'/vibyra-parts-hardening-'.getmypid()]);
    }

    protected function tearDown(): void
    {
        foreach (glob(config('cloud_workspaces.sync_parts_dir').'/*') ?: [] as $f) @unlink($f);
        @rmdir(config('cloud_workspaces.sync_parts_dir'));
        parent::tearDown();
    }

    private function withdrawn(): void
    {
        DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
    }

    public function test_without_the_agreement_a_computer_does_not_wake_or_queue_projects(): void
    {
        $this->createComputer();
        $this->withdrawn();
        $this->wake()->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'octo/app'])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->assertSame('stopped', $this->row()->state);
    }

    public function test_without_the_agreement_nothing_is_stored_but_state_and_deletes_stay_open(): void
    {
        $this->registerMac(); $this->grant('my-app');
        $this->withdrawn();
        $this->sync('get', '')->assertOk()->assertJsonPath('consent', null);
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => $this->macKey, 'name' => 'Mac'])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'other'])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->up('my-app')->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->sync('delete', '/projects/my-app')->assertOk();
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('user_id', $this->user->id)->count());
    }

    public function test_the_shipped_agreement_is_version_three(): void
    {
        // 2 covers conversations, the 30-day disk and hours/tokens; 3 adds "only the projects you pick". An older acceptance must be asked again.
        $this->assertSame(3, app(\App\Services\CloudComputer\ConnectConsent::class)->current());
    }

    public function test_an_outdated_agreement_counts_as_none(): void
    {
        config(['cloud_workspaces.connect_consent_version' => (int) config('cloud_workspaces.connect_consent_version') + 1]);
        $this->sync('put', '/macs/'.$this->deviceId, ['publicKey' => $this->macKey, 'name' => 'Mac'])->assertStatus(409)->assertJsonPath('code', 'connect_required');
    }

    public function test_withdrawing_stops_the_computer_and_deletes_synced_data(): void
    {
        $this->registerMac(); $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $this->computerReady();
        $this->deleteJson('/api/cloud-computer/connect')->assertOk()->assertJsonPath('connected', false);
        $this->assertNotNull(DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->value('revoked_at'));
        $this->assertContains($this->row()->state, ['stopping', 'stopped']);
        foreach (['cloud_sync_blobs', 'cloud_sync_projects', 'cloud_sync_macs'] as $table) {
            $this->assertSame(0, DB::table($table)->where('user_id', $this->user->id)->count(), $table);
        }
        $this->wake()->assertStatus(409)->assertJsonPath('code', 'connect_required');
    }

    public function test_unfinished_uploads_are_capped_per_account_and_must_fit_the_quota(): void
    {
        $piece = random_bytes(1024);
        $start = fn (string $name, int $total) => $this->raw('PUT', '/api/cloud-computer/sync/projects/'.$name.'/up-part?'.http_build_query(['kind' => 'code',
            'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40), 'sha256' => hash('sha256', $name.$total), 'offset' => 0, 'total' => $total]), $piece, 'cloud-test');
        // A newer attempt at the same project replaces the older unfinished one instead of piling up.
        $this->grant('p0', substr(hash('sha256', 'p0'), 0, 32));
        $start('p0', 4096)->assertOk(); $start('p0', 8192)->assertOk();
        $this->assertCount(1, glob(config('cloud_workspaces.sync_parts_dir').'/*.part'));
        foreach (range(1, SyncUploadParts::MAX_OPEN - 1) as $i) { $this->grant("p$i", substr(hash('sha256', "p$i"), 0, 32)); $start("p$i", 4096)->assertOk(); }
        $this->grant('one-more', substr(hash('sha256', 'one-more'), 0, 32));
        $start('one-more', 4096)->assertStatus(429)->assertJsonPath('code', 'too_many_uploads');
        // An upload that could never fit is refused before any of it is kept.
        config(['cloud_workspaces.sync_quota_bytes' => 2048]);
        foreach (glob(config('cloud_workspaces.sync_parts_dir').'/*.part') ?: [] as $f) @unlink($f);
        $start('one-more', 4096)->assertStatus(413)->assertJsonPath('code', 'quota_exceeded');
        $this->assertCount(0, glob(config('cloud_workspaces.sync_parts_dir').'/*.part'));
    }

    public function test_storing_sync_routes_go_through_the_market_gate_and_reads_and_deletes_do_not(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes());
        $gated = fn (string $method, string $uri) => in_array(\App\Http\Middleware\RequireApprovedMarket::class,
            $routes->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods(), true))->gatherMiddleware(), true);
        foreach ([['PUT', 'projects/{name}/up'], ['PUT', 'projects/{name}/up-part'], ['PUT', 'macs/{deviceId}'], ['POST', 'projects'], ['PUT', 'login/{provider}']] as [$m, $u]) {
            $this->assertTrue($gated($m, 'api/cloud-computer/sync/'.$u), "$m $u");
        }
        foreach ([['GET', 'api/cloud-computer/sync'], ['DELETE', 'api/cloud-computer/sync/projects/{name}'], ['DELETE', 'api/cloud-computer/sync/login/{provider}'], ['DELETE', 'api/cloud-computer/connect']] as [$m, $u]) {
            $this->assertFalse($gated($m, $u), "$m $u");
        }
    }

    public function test_withdrawing_an_asleep_computer_works_and_drops_unfinished_uploads(): void
    {
        $this->createComputer(); $this->grant('p0', substr(hash('sha256', 'p0'), 0, 32));
        $this->raw('PUT', '/api/cloud-computer/sync/projects/p0/up-part?'.http_build_query(['kind' => 'code', 'seq' => 1, 'baseSeq' => 0,
            'head' => str_repeat('c', 40), 'sha256' => str_repeat('d', 64), 'offset' => 0, 'total' => 4096]), random_bytes(1024), 'cloud-test')->assertOk();
        $this->assertCount(1, glob(config('cloud_workspaces.sync_parts_dir').'/*.part'));
        $this->deleteJson('/api/cloud-computer/connect')->assertOk()->assertJsonPath('connected', false);
        $this->assertCount(0, glob(config('cloud_workspaces.sync_parts_dir').'/*.part'));
        $this->assertSame('stopped', $this->row()->state);
    }
}
